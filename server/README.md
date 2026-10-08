# README

## docker commands

day to day development.
run this on each change that touches the database.
data does not persist.

```bash
docker compose down -v && docker compose up -d --build
```

if change doesn't touch database, then run this. (data persists in postgres_data).

```bash
docker compose up -d --build
```

stop containers. (data persists in postgres_data).

```bash
docker compose down
```

building production image

```bash
docker build --target production -t production:latest .
```

## migration examples

```bash
npm run migration:generate src/migrations/RenameThisToThat
```
