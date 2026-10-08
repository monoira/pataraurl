# AGENTS.md

## testing and debugging

during testing and debugging, DO NOT run `npm run start:dev` or `npm run start`.
Development is done using docker and docker compose.

docker containers are ran using this command:

```bash
docker compose down -v && docker compose up -d --build
```

API is usually located at http://localhost:3000/v1

OpenAPI json schema at http://localhost:3000/api-json

you could use curl to reach those and other endpoints if needed.
