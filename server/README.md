# README

## docker commands - local

### day to day development

database data does NOT persist in postgres_data

```bash
docker compose down -v && docker compose up -d --build
```

use when you want database data to persist
database data persists in postgres_data

```bash
docker compose up -d --build
```

### stop containers

stop containers.
database data persists in postgres_data.

```bash
docker compose down
```

stop containers.
database data does NOT persist in postgres_data.

```bash
docker compose down -v
```

## building production image

```bash
docker build --target production -t production:latest .
```

## migration examples

```bash
npm run migration:generate -- src/migrations/RenameThisToThat
```

```bash
npm run migration:run
```
