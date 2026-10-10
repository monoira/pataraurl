import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

const config = new pulumi.Config();
const corsOrigin = config.require("corsOrigin");

const containerPort = 3000;

const vpc = aws.ec2.getVpcOutput({ default: true });

// ECR

const serverRepo = new aws.ecr.Repository("server-repo", {
  name: "pataraurl/server",
});

new aws.ecr.LifecyclePolicy("server-repo-lifecycle", {
  repository: serverRepo.name,
  policy: pulumi.jsonStringify({
    rules: [
      {
        rulePriority: 1,
        description: "Keep the 10 most recent images",
        selection: {
          tagStatus: "any",
          countType: "imageCountMoreThan",
          countNumber: 10,
        },
        action: { type: "expire" },
      },
    ],
  }),
});

// Database
// The password is generated here and stored in SSM (free) instead of using
// RDS managed passwords, which rotate and break running ECS tasks.

const dbPassword = new random.RandomPassword("db-password", {
  length: 32,
  special: false,
});

const dbPasswordParam = new aws.ssm.Parameter("db-password-param", {
  type: "SecureString",
  value: dbPassword.result,
});

// Tasks run in the default VPC, so allow Postgres from inside the VPC only
const dbSecurityGroup = new aws.ec2.SecurityGroup("db-sg", {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: [vpc.cidrBlock],
    },
  ],
});

const database = new aws.rds.Instance("database", {
  engine: "postgres",
  engineVersion: "18",
  instanceClass: "db.t4g.micro",
  allocatedStorage: 20,
  username: "postgres",
  password: dbPassword.result,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  storageEncrypted: true,
  publiclyAccessible: false,
  backupRetentionPeriod: 7,
  deletionProtection: true,
  skipFinalSnapshot: false,
  finalSnapshotIdentifier: "pataraurl-final-snapshot",
});

// IAM roles for ECS Express Mode
// execution role: pulls the image, writes logs, reads the DB password
// infrastructure role: lets ECS create the load balancer, HTTPS cert, etc.

const executionRole = new aws.iam.Role("execution-role", {
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

const executionRoleAttachment = new aws.iam.RolePolicyAttachment(
  "execution-role-attachment",
  {
    role: executionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  },
);

const executionRoleSsmPolicy = new aws.iam.RolePolicy(
  "execution-role-ssm-policy",
  {
    role: executionRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["ssm:GetParameters"],
          Resource: [dbPasswordParam.arn],
        },
      ],
    }),
  },
);

const infrastructureRole = new aws.iam.Role("infrastructure-role", {
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

const infrastructureRoleAttachment = new aws.iam.RolePolicyAttachment(
  "infrastructure-role-attachment",
  {
    role: infrastructureRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices",
  },
);

// ECS Express Mode service
// AWS creates the load balancer and a free HTTPS URL (*.ecs.<region>.on.aws),
// so no domain or certificate is needed.

const logGroup = new aws.cloudwatch.LogGroup("server-log-group", {
  retentionInDays: 7,
});

const cluster = new aws.ecs.Cluster("cluster");

const service = new aws.ecs.ExpressGatewayService(
  "server-service",
  {
    cluster: cluster.name,
    cpu: "256",
    memory: "512",
    executionRoleArn: executionRole.arn,
    infrastructureRoleArn: infrastructureRole.arn,
    healthCheckPath: "/health",
    primaryContainer: {
      image: pulumi.interpolate`${serverRepo.repositoryUrl}:latest`,
      containerPort,
      awsLogsConfigurations: [
        { logGroup: logGroup.name, logStreamPrefix: "ecs" },
      ],
      environments: [
        { name: "NODE_ENV", value: "production" },
        { name: "PORT", value: String(containerPort) },
        { name: "CORS_ORIGIN", value: corsOrigin },
        { name: "DATABASE_HOST", value: database.address },
        { name: "DATABASE_PORT", value: "5432" },
        { name: "DATABASE_USER", value: "postgres" },
        { name: "DATABASE_NAME", value: "postgres" },
        { name: "DATABASE_SSL", value: "true" },
      ],
      secrets: [{ name: "DATABASE_PASSWORD", valueFrom: dbPasswordParam.arn }],
    },
  },
  {
    dependsOn: [
      executionRoleAttachment,
      executionRoleSsmPolicy,
      infrastructureRoleAttachment,
    ],
    // CI deploys new image tags, so Pulumi must not reset the image to :latest
    ignoreChanges: ["primaryContainer.image"],
  },
);

// GitHub Actions deploy role (OIDC, no stored AWS keys)

const oidcProvider = new aws.iam.OpenIdConnectProvider("github-oidc", {
  url: "https://token.actions.githubusercontent.com",
  clientIdLists: ["sts.amazonaws.com"],
});

const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: oidcProvider.arn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub":
              "repo:monoira/pataraurl:ref:refs/heads/main",
          },
        },
      },
    ],
  }),
});

new aws.iam.RolePolicy("githubActionsDeployPolicy", {
  role: githubActionsDeployRole.id,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["ecr:GetAuthorizationToken"], Resource: "*" },
      {
        Effect: "Allow",
        Action: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ],
        Resource: serverRepo.arn,
      },
      {
        Effect: "Allow",
        Action: [
          "ecs:UpdateExpressGatewayService",
          "ecs:DescribeExpressGatewayService",
        ],
        Resource: service.serviceArn,
      },
      { Effect: "Allow", Action: ["ecs:DescribeServices"], Resource: "*" },
      {
        Effect: "Allow",
        Action: ["iam:PassRole"],
        Resource: [executionRole.arn, infrastructureRole.arn],
      },
    ],
  }),
});

export const ecrRepositoryUrl = serverRepo.repositoryUrl;
export const rdsEndpoint = database.endpoint;
export const serviceArn = service.serviceArn;
export const apiEndpoints = service.ingressPaths.apply((paths) =>
  paths.map((p) => p.endpoint),
);
export const githubDeployRoleArn = githubActionsDeployRole.arn;
