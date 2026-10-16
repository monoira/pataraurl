# README

## Workflow

### 1. deploy infrastructure

```bash
pulumi preview
```

```bash
pulumi up
```

### 2. update parameters

in `AWS console -> Systems Manager -> Parameter Store`:

| Parameter           | Action                                   |
| ------------------- | ---------------------------------------- |
| `CORS_ORIGIN`       | set to client URL (including `https://`) |
| `OWNER_NAME`        | owner name                               |
| `OWNER_EMAIL`       | owner login email                        |
| `OWNER_PASSWORD`    | keep generated or replace                |
| `JWT_SECRET`        | keep generated                           |
| `DATABASE_PASSWORD` | do not touch                             |

### 3. push server image

run the GitHub workflow `deploy-server` manually to push the image to `aws/ecr`

### 4. start the service

`AWS console -> ECS -> Clusters -> default -> server -> Update -> Desired tasks = 1`

### 5. connect the client

get the API URL:

```bash
pulumi stack output apiUrl
```

set it as the API URL in Cloudflare Pages and redeploy the client

### after changing parameters

force a new ECS deployment so tasks pick up the new values
