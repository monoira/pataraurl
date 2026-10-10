import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();

const desiredCount = config.getNumber("desiredCount") ?? 1;
const certificateArn = config.get("certificateArn");
const corsOrigin = config.require("corsOrigin");
const healthCheckPath = config.get("healthCheckPath") ?? "/health";

const containerName = "Main";
const containerPort = 3000;

const vpc = aws.ec2.getVpcOutput({ default: true });

const subnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [vpc.id] }],
});

const albSecurityGroup = new aws.ec2.SecurityGroup("alb-sg", {
  description: "Public HTTP and HTTPS traffic",
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const taskSecurityGroup = new aws.ec2.SecurityGroup("task-sg", {
  description: "ECS application traffic",
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: containerPort,
      toPort: containerPort,
      securityGroups: [albSecurityGroup.id],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const dbSecurityGroup = new aws.ec2.SecurityGroup("db-sg", {
  description: "PostgreSQL traffic from ECS only",
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

const serverRepo = new aws.ecr.Repository("server-repo", {
  name: "pataraurl/server",
  imageTagMutability: "MUTABLE",
  imageScanningConfiguration: {
    scanOnPush: false,
  },
  encryptionConfigurations: [
    {
      encryptionType: "AES256",
    },
  ],
});

new aws.ecr.LifecyclePolicy("server-repo-lifecycle", {
  repository: serverRepo.name,
  policy: pulumi.jsonStringify({
    rules: [
      {
        rulePriority: 1,
        description: "Keep the 15 most recent images",
        selection: {
          tagStatus: "any",
          countType: "imageCountMoreThan",
          countNumber: 15,
        },
        action: { type: "expire" },
      },
    ],
  }),
});

const ecsTaskExecutionRole = new aws.iam.Role("ecsTaskExecutionRole", {
  name: "ecsTaskExecutionRole",
  path: "/service-role/",
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "ecs-tasks.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

const ecsTaskExecutionRoleAttachment = new aws.iam.RolePolicyAttachment(
  "ecsTaskExecutionRoleAttachment",
  {
    role: ecsTaskExecutionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  },
);

const database = new aws.rds.Instance("database", {
  identifier: "pataraurl-database",
  engine: "postgres",
  engineVersion: "18.3",
  instanceClass: "db.t3.micro",
  allocatedStorage: 20,
  maxAllocatedStorage: 1000,
  username: "postgres",
  manageMasterUserPassword: true,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  storageEncrypted: true,
  publiclyAccessible: false,
  // NOTE: when you care about data, increase this
  // keep 2 day of backups for free tier compatibility
  backupRetentionPeriod: 2,
  skipFinalSnapshot: true,
  performanceInsightsEnabled: false,
  monitoringInterval: 0,
});

const dbSecretArn = database.masterUserSecrets.apply(
  (secrets) => secrets[0].secretArn,
);

const ecsTaskExecutionSecretsPolicy = new aws.iam.RolePolicy(
  "ecsTaskExecutionSecretsPolicy",
  {
    role: ecsTaskExecutionRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue"],
          Resource: [dbSecretArn],
        },
      ],
    }),
  },
);

const cluster = new aws.ecs.Cluster("default-cluster", {
  name: "default",
});

const taskDefinition = new aws.ecs.TaskDefinition("server-task", {
  family: "default-server-bcb3",
  cpu: "512",
  memory: "1024",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  runtimePlatform: {
    cpuArchitecture: "ARM64",
    operatingSystemFamily: "LINUX",
  },
  executionRoleArn: ecsTaskExecutionRole.arn,
  containerDefinitions: pulumi.jsonStringify([
    {
      name: containerName,
      image: pulumi.interpolate`${serverRepo.repositoryUrl}:latest`,
      essential: true,
      portMappings: [
        {
          containerPort,
          hostPort: containerPort,
          protocol: "tcp",
        },
      ],
      environment: [
        { name: "NODE_ENV", value: "production" },
        { name: "PORT", value: String(containerPort) },
        { name: "CORS_ORIGIN", value: corsOrigin },
        { name: "DATABASE_HOST", value: database.address },
        { name: "DATABASE_PORT", value: "5432" },
        { name: "DATABASE_USER", value: "postgres" },
        { name: "DATABASE_NAME", value: "postgres" },
        { name: "DATABASE_SSL", value: "true" },
      ],
      secrets: [
        {
          name: "DATABASE_PASSWORD",
          valueFrom: pulumi.interpolate`${dbSecretArn}:password::`,
        },
      ],
    },
  ]),
});

const alb = new aws.lb.LoadBalancer("server-alb", {
  name: "pataraurl-alb",
  loadBalancerType: "application",
  internal: false,
  securityGroups: [albSecurityGroup.id],
  subnets: subnets.ids,
});

const targetGroup = new aws.lb.TargetGroup("server-tg", {
  name: "pataraurl-server-tg",
  port: containerPort,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: vpc.id,
  deregistrationDelay: 30,
  healthCheck: {
    path: healthCheckPath,
    matcher: "200-399",
    interval: 30,
    timeout: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 3,
  },
});

const listeners: aws.lb.Listener[] = [];

if (certificateArn) {
  listeners.push(
    new aws.lb.Listener("https-listener", {
      loadBalancerArn: alb.arn,
      port: 443,
      protocol: "HTTPS",
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      certificateArn,
      defaultActions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
    }),
  );

  listeners.push(
    new aws.lb.Listener("http-redirect-listener", {
      loadBalancerArn: alb.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "redirect",
          redirect: {
            port: "443",
            protocol: "HTTPS",
            statusCode: "HTTP_301",
          },
        },
      ],
    }),
  );
} else {
  listeners.push(
    new aws.lb.Listener("http-listener", {
      loadBalancerArn: alb.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
    }),
  );
}

const service = new aws.ecs.Service(
  "server-service",
  {
    name: "server",
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: subnets.ids,
      securityGroups: [taskSecurityGroup.id],
      assignPublicIp: true,
    },
    loadBalancers: [
      {
        targetGroupArn: targetGroup.arn,
        containerName,
        containerPort,
      },
    ],
    healthCheckGracePeriodSeconds: 120,
    deploymentCircuitBreaker: {
      enable: true,
      rollback: true,
    },
  },
  {
    dependsOn: [
      ...listeners,
      ecsTaskExecutionRoleAttachment,
      ecsTaskExecutionSecretsPolicy,
    ],
  },
);

const oidcProvider = new aws.iam.OpenIdConnectProvider("github-oidc", {
  url: "https://token.actions.githubusercontent.com",
  clientIdLists: ["sts.amazonaws.com"],
});

const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
  name: "github-actions-deploy",
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Federated: oidcProvider.arn,
        },
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
      {
        Effect: "Allow",
        Action: ["ecr:GetAuthorizationToken"],
        Resource: "*",
      },
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
        Action: ["ecs:UpdateService"],
        Resource: service.arn,
      },
      {
        Effect: "Allow",
        Action: ["ecs:DescribeServices"],
        Resource: "*",
      },
    ],
  }),
});

export const ecrRepositoryUrl = serverRepo.repositoryUrl;
export const rdsEndpoint = database.endpoint;
export const ecsClusterName = cluster.name;
export const ecsServiceName = service.name;
export const albDnsName = alb.dnsName;
