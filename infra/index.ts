import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// settings you can change without editing code.
// set them with: pulumi config set <name> <value>
const config = new pulumi.Config();

// how many copies of the server run at once.
// it starts at 0 because on the first deploy the docker image is not in ecr yet,
// so a task would just fail to start. raise it after the first image is pushed.
const desiredCount = config.getNumber("desiredCount") ?? 0;

// the https certificate (from aws certificate manager) for your api domain.
// it is optional so you can deploy before the certificate exists.
// without it the load balancer only serves plain http on port 80.
const certificateArn = config.get("certificateArn");

// the url the load balancer calls to ask "is the server alive?".
// it must answer with a status from 200 to 399, otherwise the load balancer
// treats the server as broken and stops sending it traffic.
// it is /health and not /v1/health because HealthController is VERSION_NEUTRAL.
const healthCheckPath = config.get("healthCheckPath") ?? "/health";

// the address of your frontend, for example https://app.yourdomain.com.
// the server only accepts browser requests from this address (cors).
// the server crashes on start without it, so it is required.
const corsOrigin = config.require("corsOrigin");

// the container name and port are used in several places below,
// so they live here once to stop them from getting out of sync.
const containerName = "Main";
const containerPort = 3000;

// a vpc is your private network inside aws, and subnets are slices of it.
// every aws account already has a default one, so we reuse it instead of
// building our own, which keeps this file much smaller.
const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const defaultSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
});

// a security group is a firewall: it lists who is allowed to connect.
// this one lets anyone on the internet reach the load balancer on http (80)
// and https (443), because the load balancer is the public entrance to the app.
// egress is outgoing traffic, which we allow everywhere.
const albSecurityGroup = new aws.ec2.SecurityGroup("alb-sg", {
  description: "pataraurl ALB",
  vpcId: defaultVpc.id,
  ingress: [
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});

// firewall for the server containers (ecs tasks).
// only the load balancer may connect to them, so nobody can reach the server directly.
const taskSecurityGroup = new aws.ec2.SecurityGroup("task-sg", {
  description: "pataraurl ECS tasks",
  vpcId: defaultVpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: containerPort,
      toPort: containerPort,
      securityGroups: [albSecurityGroup.id],
    },
  ],
  // outgoing traffic must stay open: the tasks have a public ip and no nat gateway
  // (an extra paid service), so they use the internet directly to pull the image
  // from ecr, write logs and read secrets.
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});

// firewall for the database.
// only the server containers may connect on 5432 (the postgres port),
// so the database is never exposed to the internet.
const dbSecurityGroup = new aws.ec2.SecurityGroup("db-sg", {
  description: "pataraurl RDS",
  vpcId: defaultVpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      securityGroups: [taskSecurityGroup.id],
    },
  ],
});

// ecr is aws's storage for docker images.
// github actions pushes the server image here, and ecs pulls it from here.
const serverRepo = new aws.ecr.Repository("server-repo", {
  name: "pataraurl/server",
  // mutable lets the :latest tag be overwritten on every push.
  imageTagMutability: "MUTABLE",
  imageScanningConfiguration: {
    // vulnerability scanning is off to keep things simple.
    scanOnPush: false,
  },
  encryptionConfigurations: [
    {
      // images are encrypted at rest with a key aws manages for free.
      encryptionType: "AES256",
    },
  ],
});

// every push adds a new image tagged with the git commit, so without a cleanup
// rule the repo would grow forever and cost money.
// this keeps the 15 newest images and deletes the rest.
const serverRepoLifecycle = new aws.ecr.LifecyclePolicy(
  "server-repo-lifecycle",
  {
    repository: serverRepo.name,
    policy: pulumi.jsonStringify({
      rules: [
        {
          rulePriority: 1,
          description: "keep the 15 most recent images",
          selection: {
            tagStatus: "any",
            countType: "imageCountMoreThan",
            countNumber: 15,
          },
          action: { type: "expire" },
        },
      ],
    }),
  },
);

// the task execution role is the permission ecs itself needs to start a task
// (it is not the app's own permissions): pull the image, write logs, read secrets.
// the assume role policy says who may use the role: only the ecs tasks service.
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

// aws already ships a policy with the standard permissions (pull images, write logs),
// so we attach it instead of writing our own.
const ecsTaskExecutionRoleAttachment = new aws.iam.RolePolicyAttachment(
  "ecsTaskExecutionRoleAttachment",
  {
    role: ecsTaskExecutionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  },
);

// a role that lets rds send extra detailed metrics (enhanced monitoring) to cloudwatch.
// rds needs a role for this, and only the rds monitoring service may use it.
const rdsMonitoringRole = new aws.iam.Role("rdsMonitoringRole", {
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "monitoring.rds.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

// the aws managed policy that holds the permissions rds monitoring needs.
const rdsMonitoringRoleAttachment = new aws.iam.RolePolicyAttachment(
  "rdsMonitoringRoleAttachment",
  {
    role: rdsMonitoringRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole",
  },
);

// the postgres database. rds is aws's managed database service,
// so aws handles backups and patching for us.
// manageMasterUserPassword makes rds create a strong random password and store it in
// secrets manager, so there is never a password in code, config or git.
const database = new aws.rds.Instance(
  "database",
  {
    identifier: "pataraurl-database",
    engine: "postgres",
    engineVersion: "18.3",
    // the smallest and cheapest size, fine for a small app.
    instanceClass: "db.t3.micro",
    // starting disk size in gb. aws grows it automatically up to the max below.
    allocatedStorage: 20,
    maxAllocatedStorage: 1000,
    username: "postgres",
    manageMasterUserPassword: true,
    // attaches the database firewall from above.
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    storageEncrypted: true,
    // no public address, so it can only be reached from inside the vpc.
    publiclyAccessible: false,
    // true means no backup snapshot is taken when the database is deleted.
    // fine while testing, set it to false once you have data you care about.
    skipFinalSnapshot: true,
    // extra monitoring: graphs of database load in the aws console.
    performanceInsightsEnabled: true,
    // send detailed metrics every 60 seconds.
    monitoringInterval: 60,
    monitoringRoleArn: rdsMonitoringRole.arn,
  },
  // the monitoring role must have its policy attached before rds can use it,
  // so we make rds wait for that.
  { dependsOn: [rdsMonitoringRoleAttachment] },
);

// the arn (unique id) of the password secret that rds created.
// rds returns a list of secrets and we only have one, so we take the first.
const dbSecretArn = database.masterUserSecrets.apply(
  (secrets) => secrets[0].secretArn,
);

// a secret for the app's own private settings (the jwt secret and the owner account).
// they go in secrets manager instead of plain env vars so they are not visible
// in the task definition or the aws console.
// pulumi creates the secret with placeholders and you replace the values by hand
// in the secrets manager console.
const appSecret = new aws.secretsmanager.Secret("server-app-secret", {
  name: "pataraurl/server",
});

// the actual value stored in the secret above.
// ignoreChanges makes pulumi leave your real values alone on later deploys,
// otherwise every pulumi up would overwrite them with the placeholders.
// every key the task definition asks for must exist here, or the task cannot start.
const appSecretVersion = new aws.secretsmanager.SecretVersion(
  "server-app-secret-version",
  {
    secretId: appSecret.id,
    secretString: pulumi.jsonStringify({
      JWT_SECRET: "replace-me",
      OWNER_EMAIL: "replace-me@example.com",
      OWNER_PASSWORD: "replace-me",
      OWNER_NAME: "replace-me",
    }),
  },
  { ignoreChanges: ["secretString"] },
);

// ecs reads the secrets before the app starts, using the task execution role,
// so that role must be allowed to read both of them.
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
          Resource: [dbSecretArn, appSecret.arn],
        },
      ],
    }),
  },
);

// a cloudwatch log group is where the server's console output (its logs) is stored,
// so you can read it in the aws console. logs are kept for 7 days to limit cost.
const logGroup = new aws.cloudwatch.LogGroup("server-log-group", {
  name: "/aws/ecs/default/server-bcb3-2ec8",
  retentionInDays: 7,
});

// an ecs cluster is just a named group that holds your services.
// there is nothing else to configure.
const cluster = new aws.ecs.Cluster("default-cluster", {
  name: "default",
});

// the task definition is the recipe for running the server container:
// which image, how much cpu and memory, which env vars and where to send logs.
// fargate means aws runs the containers for us, so there are no servers to manage.
const taskDefinition = new aws.ecs.TaskDefinition("server-task", {
  family: "default-server-bcb3",
  // 512 is half a virtual cpu and 1024 is 1 gb of memory.
  cpu: "512",
  memory: "1024",
  // required by fargate: every task gets its own network interface.
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  runtimePlatform: {
    // must match the arm64 image that github actions builds.
    cpuArchitecture: "ARM64",
    operatingSystemFamily: "LINUX",
  },
  executionRoleArn: ecsTaskExecutionRole.arn,
  // aws wants this as json text. we use jsonStringify because some values
  // (repo url, log group name, db address) are only known after those
  // resources are created.
  containerDefinitions: pulumi.jsonStringify([
    {
      name: containerName,
      // :latest is always the newest image that github actions pushed.
      image: pulumi.interpolate`${serverRepo.repositoryUrl}:latest`,
      cpu: 512,
      memory: 1024,
      essential: true,
      portMappings: [
        {
          containerPort: containerPort,
          hostPort: containerPort,
          protocol: "tcp",
          name: "main-3000-tcp",
        },
      ],
      // plain settings the app reads. nothing secret goes in here.
      environment: [
        { name: "NODE_ENV", value: "production" },
        { name: "PORT", value: String(containerPort) },
        { name: "CORS_ORIGIN", value: corsOrigin },
        { name: "DATABASE_HOST", value: database.address },
        { name: "DATABASE_PORT", value: "5432" },
        { name: "DATABASE_USER", value: "postgres" },
        // rds creates a database called postgres by default.
        { name: "DATABASE_NAME", value: "postgres" },
        // rds postgres 15 and newer refuses unencrypted connections,
        // and this tells the app to connect with ssl.
        { name: "DATABASE_SSL", value: "true" },
      ],
      // ecs fetches these from secrets manager when the task starts
      // and gives them to the app as normal env vars.
      secrets: [
        {
          name: "DATABASE_PASSWORD",
          // the rds secret is json holding a username and a password.
          // ":password::" picks only the password out of it.
          valueFrom: pulumi.interpolate`${dbSecretArn}:password::`,
        },
        // same idea: ":JWT_SECRET::" picks that one key from our own secret.
        {
          name: "JWT_SECRET",
          valueFrom: pulumi.interpolate`${appSecret.arn}:JWT_SECRET::`,
        },
        {
          name: "OWNER_EMAIL",
          valueFrom: pulumi.interpolate`${appSecret.arn}:OWNER_EMAIL::`,
        },
        {
          name: "OWNER_PASSWORD",
          valueFrom: pulumi.interpolate`${appSecret.arn}:OWNER_PASSWORD::`,
        },
        {
          name: "OWNER_NAME",
          valueFrom: pulumi.interpolate`${appSecret.arn}:OWNER_NAME::`,
        },
      ],
      // send the container's output to the log group created above.
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": logGroup.name,
          // must match the region this stack deploys to.
          "awslogs-region": "eu-north-1",
          "awslogs-stream-prefix": "ecs",
        },
      },
    },
  ]),
});

// the application load balancer (alb) is the public entrance to the app.
// it receives requests from the internet and forwards them to the server.
// we need it because the tasks' ips change on every deploy, but the alb address
// stays the same. it also takes care of https for us.
const alb = new aws.lb.LoadBalancer("server-alb", {
  name: "pataraurl-alb",
  loadBalancerType: "application",
  // false means it is reachable from the internet.
  internal: false,
  securityGroups: [albSecurityGroup.id],
  subnets: defaultSubnets.ids,
});

// the target group is the list of servers the alb forwards requests to.
const targetGroup = new aws.lb.TargetGroup("server-tg", {
  name: "pataraurl-server-tg",
  port: containerPort,
  protocol: "HTTP",
  // fargate tasks are addressed by ip, so this must be "ip".
  targetType: "ip",
  vpcId: defaultVpc.id,
  // seconds to wait for running requests to finish before removing an old task
  // during a deploy. the default is 300, which makes deploys very slow.
  deregistrationDelay: 30,
  // the alb keeps checking this url and stops sending traffic to broken servers.
  healthCheck: {
    path: healthCheckPath,
    matcher: "200-399",
    // check every 30 seconds.
    interval: 30,
    timeout: 5,
    // 2 passes in a row means healthy, 3 fails in a row means broken.
    healthyThreshold: 2,
    unhealthyThreshold: 3,
  },
});

// a listener tells the alb which port to listen on and what to do with requests.
// with a certificate: https on 443 goes to the server, and plain http on 80 is
// redirected to https so nobody ends up on the insecure version.
// without a certificate: plain http on 80 goes straight to the server,
// which is only meant for testing before the certificate exists.
const listeners: aws.lb.Listener[] = [];
if (certificateArn) {
  listeners.push(
    new aws.lb.Listener("https-listener", {
      loadBalancerArn: alb.arn,
      port: 443,
      protocol: "HTTPS",
      // allows only modern tls versions (1.2 and 1.3) and drops old insecure ones.
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      certificateArn: certificateArn,
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
          redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
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

// the ecs service keeps the wanted number of tasks running, restarts any that crash,
// connects them to the load balancer and rolls out new versions.
// without it the task definition above would never actually run.
const service = new aws.ecs.Service(
  "server-service",
  {
    name: "server",
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount: desiredCount,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: defaultSubnets.ids,
      securityGroups: [taskSecurityGroup.id],
      // the task needs a public ip to reach ecr and the internet without a nat
      // gateway. it is still safe because the firewall only lets the alb in.
      assignPublicIp: true,
    },
    loadBalancers: [
      {
        targetGroupArn: targetGroup.arn,
        containerName: containerName,
        containerPort: containerPort,
      },
    ],
    // the app runs database migrations when it starts in production, which takes
    // a while. during these seconds failed health checks are ignored, so ecs does
    // not kill the task before it has finished starting.
    healthCheckGracePeriodSeconds: 120,
    // if a new version keeps failing to start, stop the deploy and go back to the
    // last working version automatically.
    deploymentCircuitBreaker: { enable: true, rollback: true },
  },
  {
    // wait for these first, otherwise tasks could start without what they need:
    // the listeners (a target group must be attached to an alb before a service
    // can use it), the permissions to read secrets, and the secret itself.
    dependsOn: [
      ...listeners,
      ecsTaskExecutionRoleAttachment,
      ecsTaskExecutionSecretsPolicy,
      appSecretVersion,
    ],
  },
);

// the role github actions uses to deploy.
// instead of storing aws access keys in github, github proves who it is with a
// short lived token (oidc) and aws hands out temporary permissions in return.
// the assume role policy says who may use this role: only workflows from your repo
// that run on the main branch.
// the oidc provider (aws's record that it trusts github) must already exist in the account.
const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
  name: "github-actions-deploy",
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Federated:
            "arn:aws:iam::277824614813:oidc-provider/token.actions.githubusercontent.com",
        },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            // the token must be meant for aws.
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            // the sub is "which repo and branch" and github puts it in its token.
            // the @* parts are the owner and repo ids, which is the new github
            // format for repos created or renamed after 2026-07-15 (or opted in).
            // a wildcard is looser than needed, so replace each * with the real
            // number from: gh api repos/monoira/pataraurl --jq '.owner.id, .id'
            "token.actions.githubusercontent.com:sub":
              "repo:monoira@*/pataraurl@*:ref:refs/heads/main",
          },
        },
      },
    ],
  }),
});

// what the deploy role is allowed to do after it logs in.
// we only give what the workflow needs (least privilege): log in to ecr, push images
// to our repo, and restart our service so it pulls the new image.
const githubActionsDeployPolicy = new aws.iam.RolePolicy(
  "githubActionsDeployPolicy",
  {
    role: githubActionsDeployRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          // logging in to ecr cannot be limited to one repo, so this uses "*".
          Action: "ecr:GetAuthorizationToken",
          Resource: "*",
        },
        {
          Effect: "Allow",
          // the actions docker needs to upload an image, only on our repo.
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
          // restart the service and wait until the deploy is finished, only on our service.
          Action: ["ecs:UpdateService", "ecs:DescribeServices"],
          Resource: service.id,
        },
      ],
    }),
  },
);

// values printed after pulumi up, so you can copy them without searching the aws console.
export const ecrRepositoryUrl = serverRepo.repositoryUrl;
export const rdsEndpoint = database.endpoint;
export const ecsClusterName = cluster.name;
export const ecsServiceName = service.name;
// point your cloudflare cname (for example api.yourdomain.com) at this address.
export const albDnsName = alb.dnsName;
