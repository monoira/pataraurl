import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

// ==========================================
// CONFIGURATION & GITHUB DEPLOYMENT OIDC
// ==========================================

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

/**
 * placeholder value used for initial SSM parameters before manual console configuration
 */
const placeholder = "change-me";

/**
 * container name used in task definition and service discovery
 */
const containerName = "server";

/**
 * container port exposed by the server application
 */
const containerPort = 3000;

/**
 * GitHub repository owner username for OIDC trust condition
 *
 * ```sh
 * gh api user --jq '.login'
 * ```
 */
const githubOwner = "monoira";

/**
 * GitHub repository owner numeric ID for OIDC trust condition
 *
 * ```sh
 * gh api users/OWNER --jq '.id'
 * ```
 */
const githubOwnerId = "116330974";

/**
 * GitHub repository name for OIDC trust condition
 *
 * ```sh
 * gh api repos/OWNER/REPO --jq '.name'
 * ```
 */
const githubRepo = "pataraurl";

/**
 * GitHub repository numeric ID for OIDC trust condition
 *
 * ```sh
 * gh api repos/OWNER/REPO --jq '.id'
 * ```
 */
const githubRepoId = "1410160052";

/**
 * expected AWS account ID to prevent accidental cross-account deployments
 *
 * ```sh
 * aws sts get-caller-identity --query Account --output text
 * ```
 */
const expectedAWSAccountId = "277824614813";

/**
 * validates deployment caller identity against expected AWS account
 */
const callerIdentity = aws.getCallerIdentityOutput();
callerIdentity.accountId.apply((accountId) => {
  if (accountId !== expectedAWSAccountId) {
    throw new Error(
      `Pulumi is deploying to AWS account ${accountId}, but the GitHub workflow ` +
        `assumes a role in ${expectedAWSAccountId}. Fix your AWS credentials/profile.`,
    );
  }
});

// ==========================================
// NETWORKING & VPC
// ==========================================

/**
 * default VPC reference to provision infrastructure within existing network
 */
const vpc = aws.ec2.getVpcOutput({ default: true });

/**
 * subnet lookup within the VPC for ECS tasks and VPC links
 */
const allSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [vpc.id] }],
});

/**
 * selected subnet IDs sorted and limited for deployment
 */
const subnetIds = allSubnets.ids.apply((ids) => [...ids].sort().slice(0, 2));

/**
 * internet gateway allowing private VPC resources
 * to communicate with the external internet
 */
const igw = new aws.ec2.InternetGateway("main-igw", {
  vpcId: vpc.id,
  tags: { Name: "main-igw" },
});

/**
 * main route table reference to attach outbound internet routing rules
 */
const mainRouteTable = aws.ec2.getRouteTableOutput({
  vpcId: vpc.id,
  filters: [{ name: "association.main", values: ["true"] }],
});

/**
 * default route directing outbound traffic to the internet gateway
 * so tasks can pull images and reach external APIs
 */
// oxlint-disable-next-line no-unused-vars
const igwRoute = new aws.ec2.Route("igw-route", {
  routeTableId: mainRouteTable.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: igw.id,
});

// ==========================================
// ECR CONTAINER REGISTRY
// ==========================================

/**
 * ECR repository storing container images for ECS task deployment
 */
const serverRepo = new aws.ecr.Repository("server-repo", {
  name: "pataraurl/server",
});

/**
 * ECR lifecycle policy to automatically expire older images
 * and control storage costs
 */
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

// ==========================================
// SECURITY GROUPS
// ==========================================

/**
 * security group for API Gateway VPC link egress traffic
 */
const vpcLinkSecurityGroup = new aws.ec2.SecurityGroup("vpc-link-sg", {
  vpcId: vpc.id,
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});

/**
 * security group restricting task ingress exclusively
 * to API Gateway VPC link traffic
 */
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

/**
 * security group restricting database access exclusively to ECS tasks
 */
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

// ==========================================
// PARAMETER STORE & SECRETS
// ==========================================

/**
 * random secret generated for JWT authentication
 */
const jwtSecret = new random.RandomPassword("jwt-secret", {
  length: 64,
  special: false,
});

/**
 * random password generated for application owner account
 */
const ownerPassword = new random.RandomPassword("owner-password", {
  length: 24,
  special: false,
});

/**
 * random password generated for PostgreSQL database master user
 */
const dbPassword = new random.RandomPassword("db-password", {
  length: 32,
  special: false,
});

/**
 * helper function to provision SSM parameters with optional
 * change ignoring for manual console updates
 */
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

/**
 * application parameters stored in SSM parameter store for runtime configuration
 */
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
  DATABASE_PASSWORD: param("DATABASE_PASSWORD", dbPassword.result, {
    secure: true,
  }),
};

// ==========================================
// RDS DATABASE
// ==========================================

/**
 * RDS PostgreSQL database instance storing application data
 */
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
  backupRetentionPeriod: 0,
  skipFinalSnapshot: false,
  finalSnapshotIdentifier: "pataraurl-final-snapshot",
});

// ==========================================
// ECS & IAM
// ==========================================

/**
 * IAM role allowing ECS tasks to assume execution permissions
 */
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

/**
 * policy attachment granting standard ECS execution permissions
 */
const executionRoleAttachment = new aws.iam.RolePolicyAttachment(
  "execution-role-attachment",
  {
    role: executionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  },
);

/**
 * IAM role policy granting ECS execution role
 * permission to read SSM parameters
 */
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

/**
 * CloudWatch log group collecting container stdout logs with retention policy
 */
const logGroup = new aws.cloudwatch.LogGroup("server-log-group", {
  retentionInDays: 7,
});

/**
 * ECS cluster hosting the server application service
 */
const cluster = new aws.ecs.Cluster("cluster", { name: "default" });

/**
 * ECS task definition configuring Fargate container limits,
 * environment variables, and secrets
 */
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
          "awslogs-region": region,
          "awslogs-stream-prefix": "ecs",
        },
      },
    },
  ]),
});

/**
 * private DNS namespace enabling internal service discovery within the VPC
 */
const namespace = new aws.servicediscovery.PrivateDnsNamespace("namespace", {
  name: "pataraurl.local",
  vpc: vpc.id,
});

/**
 * service discovery registration allowing API Gateway to resolve ECS task IPs
 */
const discoveryService = new aws.servicediscovery.Service("server-discovery", {
  name: "server",
  forceDestroy: true,
  dnsConfig: {
    namespaceId: namespace.id,
    routingPolicy: "MULTIVALUE",
    dnsRecords: [{ ttl: 10, type: "SRV" }],
  },
});

/**
 * ECS service managing task deployment, desired count,
 * and service discovery integration
 */
const service = new aws.ecs.Service(
  "server-service",
  {
    name: "server",
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
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

// ==========================================
// API GATEWAY
// ==========================================

/**
 * API Gateway HTTP API providing public HTTPS ingress
 */
const api = new aws.apigatewayv2.Api("api", {
  name: "pataraurl",
  protocolType: "HTTP",
});

/**
 * VPC link routing API Gateway traffic securely into the VPC
 */
const vpcLink = new aws.apigatewayv2.VpcLink("vpc-link", {
  name: "pataraurl",
  securityGroupIds: [vpcLinkSecurityGroup.id],
  subnetIds,
});

/**
 * HTTP proxy integration connecting API Gateway to service discovery
 */
const integration = new aws.apigatewayv2.Integration("integration", {
  apiId: api.id,
  integrationType: "HTTP_PROXY",
  integrationMethod: "ANY",
  connectionType: "VPC_LINK",
  connectionId: vpcLink.id,
  integrationUri: discoveryService.arn,
});

/**
 * default route forwarding all incoming requests to the integration proxy
 */
new aws.apigatewayv2.Route("route", {
  apiId: api.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${integration.id}`,
});

/**
 * API Gateway stage with automatic deployment and rate limiting
 */
new aws.apigatewayv2.Stage("stage", {
  apiId: api.id,
  name: "$default",
  autoDeploy: true,
  defaultRouteSettings: {
    throttlingRateLimit: 20,
    throttlingBurstLimit: 40,
  },
});

// ==========================================
// GITHUB ACTIONS OIDC DEPLOY ROLE
// ==========================================

/**
 * OIDC identity provider trusting GitHub Actions token issuer
 */
const oidcProvider = new aws.iam.OpenIdConnectProvider("github-oidc", {
  url: "https://token.actions.githubusercontent.com",
  clientIdLists: ["sts.amazonaws.com"],
});

/**
 * IAM role assumed by GitHub Actions via OIDC for
 * deployments without stored AWS keys
 */
const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
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
            "token.actions.githubusercontent.com:sub": `repo:${githubOwner}@${githubOwnerId}/${githubRepo}@${githubRepoId}:ref:refs/heads/main`,
          },
        },
      },
    ],
  }),
});

/**
 * IAM policy granting GitHub Actions permission to push
 * container images and update ECS services
 */
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

// ==========================================
// STACK EXPORTS
// ==========================================

/** public endpoint URL of the API Gateway */
export const apiUrl = api.apiEndpoint;

/** ECR repository URL for container image pushes */
export const ecrRepositoryUrl = serverRepo.repositoryUrl;

/** RDS database connection endpoint address */
export const rdsEndpoint = database.endpoint;
