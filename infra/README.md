# README

## workflow

### 1

```bash
pulumi up
```

### 2

run the GitHub workflow (Actions, **deploy-server**, Run workflow). This pushes the image to ECR, which now exists.

### 3

| Parameter           | What to do                                              |
| ------------------- | ------------------------------------------------------- |
| `CORS_ORIGIN`       | set to `https://pataraurl.pages.dev`                    |
| `OWNER_EMAIL`       | your login email                                        |
| `OWNER_NAME`        | your name                                               |
| `OWNER_PASSWORD`    | already a random strong value; keep it or type your own |
| `JWT_SECRET`        | **already random, leave it**                            |
| `DATABASE_PASSWORD` | **don't touch it**                                      |

`DATABASE_PASSWORD` is the only one you must not edit. Pulumi generated it and gave the same value to the database. If you change it in the console, the app's password stops matching the database's and the server can't connect. Pulumi also created `JWT_SECRET` and `OWNER_PASSWORD` for you, so those two only need a change if you want your own value.

### 4

ECS > Clusters > default > server > Update > Desired tasks = 1. Wait until the task is Running.

### 5

```bash
pulumi stack output apiUrl
```

set it as the API URL in Cloudflare Pages, redeploy the client.

### 6

after editing any parameter, restart the service (run the workflow, or ECS > Update > Force new deployment), otherwise the old values stay in use.
