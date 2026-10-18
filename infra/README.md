# README

it mainly uses:

- aws/IAM
- aws/cloudwatch
- aws/ecr
- aws/ecs
- aws/rds (postgres)

NOTE:
this pulumi setup doesn't have ALB (application load balancer) in order to keep
costs to ~$25 a month, instead of ~$50 a month with ALB.

## Workflow

### 1. deploy infrastructure

```bash
pulumi refresh --yes && pulumi preview
```

```bash
pulumi refresh --yes && pulumi up
```

### 2. update parameters

in `AWS console -> Systems Manager -> Parameter Store`:

| Parameter           | Action                                   |
| ------------------- | ---------------------------------------- |
| `CORS_ORIGIN`       | set to client URL (including `https://`) |
| `OWNER_NAME`        | owner name                               |
| `OWNER_EMAIL`       | owner login email                        |
| `OWNER_PASSWORD`    | keep generated or replace                |
| `JWT_SECRET`        | KEEP GENERATED                           |
| `DATABASE_PASSWORD` | DO NOT TOUCH                             |

### 3. push server image

run the GitHub workflow `deploy-server` manually to push the image to `aws/ecr`

### 4. start the service

service starts with 0 tasks to prevent premature execution
change that to at least 1 to start the service.
with it being 1 and ALB being off, things won't go out of hand.
It will just scale to 1 server MAX.

`AWS console -> ECS -> Clusters -> default -> server -> Update -> Desired tasks = 1`

### 5. connect the client

get the server API URL:

```bash
pulumi stack output apiUrl
```

set it as the baseUrl on client,  
then redeploy the client

### finally

force a new ECS deployment so tasks pick up the new values
