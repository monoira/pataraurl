import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

// no config in code - set initial values in aws console (parameter store).
const placeholder = "change-me";

const containerName = "server";
const containerPort = 3000;

// github deployment configuration
// AWS account id must match workflow's role-to-assume
// immutable oidc sub claim format for newer repositories:
// repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:refs/heads/main

// gh api user --jq '.login'
const githubOwner = "monoira";
// gh api users/OWNER --jq '.id'
const githubOwnerId = "116330974";

// gh api repos/OWNER/REPO --jq '.name'
const githubRepo = "pataraurl";
// gh api repos/OWNER/REPO --jq '.id'
const githubRepoId = "1410160052";

// aws sts get-caller-identity --query Account --output text
const expectedAWSAccountId = "277824614813";

const callerIdentity = aws.getCallerIdentityOutput();
callerIdentity.accountId.apply((accountId) => {
  if (accountId !== expectedAWSAccountId) {
    throw new Error(
      `Pulumi is deploying to AWS account ${accountId}, but the GitHub workflow ` +
        `assumes a role in ${expectedAWSAccountId}. Fix your AWS credentials/profile.`,
    );
  }
});

const vpc = aws.ec2.getVpcOutput({ default: true });
const allSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [vpc.id] }],
});
const subnetIds = allSubnets.ids.apply((ids) => [...ids].sort().slice(0, 2));

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

// security groups
// flow: api gateway -> vpc link -> task -> database
// task uses public ip for image pulls; security group restricts ingress to vpc link

const vpcLinkSecurityGroup = new aws.ec2.SecurityGroup("vpc-link-sg", {
  vpcId: vpc.id,
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});

const taskSecurityGroup = new aws.ec2.SecurityGroup("task-sg", {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: containerPort,
      toPort: containerPort,
      securityGroups: [vpcLinkSecurityGroup.id],
    },
  ],
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});

const dbSecurityGroup = new aws.ec2.SecurityGroup("db-sg", {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      securityGroups: [taskSecurityGroup.id],
    },
  ],
});

// settings and secrets stored in ssm parameter store
// pulumi sets initial values and ignores subsequent changes to allow manual console updates
// restart service after configuration changes

const jwtSecret = new random.RandomPassword("jwt-secret", {
  length: 64,
  special: false,
});

const ownerPassword = new random.RandomPassword("owner-password", {
  length: 24,
  special: false,
});

const dbPassword = new random.RandomPassword("db-password", {
  length: 32,
  special: false,
});

function param(
  name: string,
  value: pulumi.Input<string>,
  opts: { secure?: boolean; editable?: boolean } = {},
) {
  return new aws.ssm.Parameter(
    `param-${name}`,
    {
      name: `/pataraurl/${name}`,
      type: opts.secure ? "SecureString" : "String",
      value,
    },
    { ignoreChanges: opts.editable ? ["value"] : [] },
  );
}

const appParams: Record<string, aws.ssm.Parameter> = {
  CORS_ORIGIN: param("CORS_ORIGIN", placeholder, { editable: true }),
  OWNER_EMAIL: param("OWNER_EMAIL", placeholder, { editable: true }),
  OWNER_NAME: param("OWNER_NAME", placeholder, { editable: true }),
  JWT_SECRET: param("JWT_SECRET", jwtSecret.result, {
    secure: true,
    editable: true,
  }),
  OWNER_PASSWORD: param("OWNER_PASSWORD", ownerPassword.result, {
    secure: true,
    editable: true,
  }),
  // pulumi manages this as it must match database
  DATABASE_PASSWORD: param("DATABASE_PASSWORD", dbPassword.result, {
    secure: true,
  }),
};

// RDS database

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
  // WARN: there's no backups allowed on AWS free plan
  // change this to 7 when you upgrade to paid plan
  backupRetentionPeriod: 0,
  skipFinalSnapshot: false,
  finalSnapshotIdentifier: "pataraurl-final-snapshot",
});

// ECS

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
          Resource: Object.values(appParams).map((p) => p.arn),
        },
      ],
    }),
  },
);

const logGroup = new aws.cloudwatch.LogGroup("server-log-group", {
  retentionInDays: 7,
});

// name matches github workflow (ecs_cluster: default)
const cluster = new aws.ecs.Cluster("cluster", { name: "default" });

const taskDefinition = new aws.ecs.TaskDefinition("server-task", {
  family: "pataraurl-server",
  cpu: "256",
  memory: "512",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  runtimePlatform: {
    cpuArchitecture: "ARM64",
    operatingSystemFamily: "LINUX",
  },
  executionRoleArn: executionRole.arn,
  containerDefinitions: pulumi.jsonStringify([
    {
      name: containerName,
      image: pulumi.interpolate`${serverRepo.repositoryUrl}:latest`,
      essential: true,
      portMappings: [{ containerPort, protocol: "tcp" }],
      // infrastructure-related, not in parameter store
      environment: [
        { name: "NODE_ENV", value: "production" },
        { name: "PORT", value: String(containerPort) },
        { name: "DATABASE_HOST", value: database.address },
        { name: "DATABASE_PORT", value: "5432" },
        { name: "DATABASE_USER", value: "postgres" },
        { name: "DATABASE_NAME", value: "postgres" },
        { name: "DATABASE_SSL", value: "true" },
      ],
      secrets: Object.entries(appParams).map(([name, p]) => ({
        name,
        valueFrom: p.arn,
      })),
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": logGroup.name,
          "awslogs-region": aws.getRegionOutput().name,
          "awslogs-stream-prefix": "ecs",
        },
      },
    },
  ]),
});

// service discovery: ecs registers task address; api gateway uses it, replacing load balancer

const namespace = new aws.servicediscovery.PrivateDnsNamespace("namespace", {
  name: "pataraurl.local",
  vpc: vpc.id,
});

const discoveryService = new aws.servicediscovery.Service("server-discovery", {
  name: "server",
  dnsConfig: {
    namespaceId: namespace.id,
    routingPolicy: "MULTIVALUE",
    // srv required for api gateway (needs ip and port)
    dnsRecords: [{ ttl: 10, type: "SRV" }],
  },
  healthCheckCustomConfig: {},
});

// name matches github workflow (ecs_service: server)
const service = new aws.ecs.Service(
  "server-service",
  {
    name: "server",
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    // starts at 0 on purpose
    // update to 1 in ecs console after editing parameters in
    // AWS console -> Systems Manager -> Parameter Store
    // note: pulumi does ignore subsequent count changes
    desiredCount: 0,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: subnetIds,
      securityGroups: [taskSecurityGroup.id],
      assignPublicIp: true,
    },
    serviceRegistries: {
      registryArn: discoveryService.arn,
      containerName,
      containerPort,
    },
    deploymentCircuitBreaker: { enable: true, rollback: true },
  },
  {
    dependsOn: [executionRoleAttachment, executionRoleSsmPolicy],
    ignoreChanges: ["desiredCount"],
  },
);

// api gateway provides public https ingress

const api = new aws.apigatewayv2.Api("api", {
  name: "pataraurl",
  protocolType: "HTTP",
});

const vpcLink = new aws.apigatewayv2.VpcLink("vpc-link", {
  name: "pataraurl",
  securityGroupIds: [vpcLinkSecurityGroup.id],
  subnetIds,
});

const integration = new aws.apigatewayv2.Integration("integration", {
  apiId: api.id,
  integrationType: "HTTP_PROXY",
  integrationMethod: "ANY",
  connectionType: "VPC_LINK",
  connectionId: vpcLink.id,
  integrationUri: discoveryService.arn,
});

new aws.apigatewayv2.Route("route", {
  apiId: api.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${integration.id}`,
});

new aws.apigatewayv2.Stage("stage", {
  apiId: api.id,
  name: "$default",
  autoDeploy: true,
  // cap requests to prevent bot flooding from running up the bill
  defaultRouteSettings: {
    throttlingRateLimit: 20,
    throttlingBurstLimit: 40,
  },
});

// github actions deploy role uses oidc without stored aws keys

const oidcProvider = new aws.iam.OpenIdConnectProvider("github-oidc", {
  url: "https://token.actions.githubusercontent.com",
  clientIdLists: ["sts.amazonaws.com"],
});

const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
  // name matches github workflow
  name: "github-actions-deploy",
  description: "Deployment role for GitHub Actions",
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
            // restrict to main branch pushes and workflow dispatches using case-sensitive sub claim
            "token.actions.githubusercontent.com:sub": `repo:${githubOwner}@${githubOwnerId}/${githubRepo}@${githubRepoId}:ref:refs/heads/main`,
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
      { Effect: "Allow", Action: ["ecs:UpdateService"], Resource: service.id },
      { Effect: "Allow", Action: ["ecs:DescribeServices"], Resource: "*" },
    ],
  }),
});

export const apiUrl = api.apiEndpoint;
export const ecrRepositoryUrl = serverRepo.repositoryUrl;
export const rdsEndpoint = database.endpoint;
