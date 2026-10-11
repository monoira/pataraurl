import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

// No settings live in this file or in Pulumi config. Your own values start as
// "change-me" and you set the real ones in the AWS console
// (Systems Manager > Parameter Store). The service starts with 0 tasks so
// nothing runs until you have done that.
const placeholder = "change-me";

const containerName = "server";
const containerPort = 3000;

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

// Security groups
// API Gateway -> (VPC link) -> task -> database
// The task has a public IP only so it can pull images. Its security group
// accepts traffic from the VPC link and nothing else.

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

// Settings and secrets in SSM Parameter Store (free).
// Pulumi sets the first value, then never overwrites it, so you can edit
// values in the AWS console (Systems Manager > Parameter Store).
// After editing, restart the service to pick up the change.

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
  // Pulumi owns this one because it must match the database
  DATABASE_PASSWORD: param("DATABASE_PASSWORD", dbPassword.result, {
    secure: true,
  }),
};

// Database

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

// Name matches the GitHub workflow (ECS_CLUSTER: default)
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
      // Wired to the infrastructure, so set here and not in Parameter Store
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

// Service discovery: ECS registers the task's address here, and API Gateway
// looks it up. This replaces the load balancer.

const namespace = new aws.servicediscovery.PrivateDnsNamespace("namespace", {
  name: "pataraurl.local",
  vpc: vpc.id,
});

const discoveryService = new aws.servicediscovery.Service("server-discovery", {
  name: "server",
  dnsConfig: {
    namespaceId: namespace.id,
    routingPolicy: "MULTIVALUE",
    // SRV is required: API Gateway needs both the IP and the port
    dnsRecords: [{ ttl: 10, type: "SRV" }],
  },
  healthCheckCustomConfig: {},
});

// Name matches the GitHub workflow (ECS_SERVICE: server)
const service = new aws.ecs.Service(
  "server-service",
  {
    name: "server",
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    // Starts at 0 on purpose. After you edit the parameters, set this to 1 in
    // the ECS console. Pulumi ignores later changes to the count.
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

// API Gateway HTTP API: the public HTTPS front door

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
  // Caps requests so a bot flood cannot run up the bill
  defaultRouteSettings: {
    throttlingRateLimit: 20,
    throttlingBurstLimit: 40,
  },
});

// GitHub Actions deploy role (OIDC, no stored AWS keys)

const oidcProvider = new aws.iam.OpenIdConnectProvider("github-oidc", {
  url: "https://token.actions.githubusercontent.com",
  clientIdLists: ["sts.amazonaws.com"],
});

const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
  // Name matches the GitHub workflow
  name: "github-actions-deploy",
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
      { Effect: "Allow", Action: ["ecs:UpdateService"], Resource: service.id },
      { Effect: "Allow", Action: ["ecs:DescribeServices"], Resource: "*" },
    ],
  }),
});

export const apiUrl = api.apiEndpoint;
export const ecrRepositoryUrl = serverRepo.repositoryUrl;
export const rdsEndpoint = database.endpoint;
