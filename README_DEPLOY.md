# TSCT App — Запуск з нуля

## Вимоги
- [Bun](https://bun.sh) >= 1.3
- БД: [Turso](https://turso.tech) (безкоштовно) або будь-який libsql/SQLite

---

## 1. Клонувати / розпакувати

```bash
unzip tsct-full.zip
cd tsct-app
```

## 2. Створити `.env`

```env
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=your_token_here
PORT=3001
```

Або для локального SQLite (без Turso):
```env
DATABASE_URL=file:./local.db
PORT=3001
```

## 3. Встановити залежності

```bash
bun install
```

## 4. Застосувати схему БД

```bash
cd packages/web
bun --env-file=../../.env drizzle-kit push
cd ../..
```

## 5. Запустити в dev-режимі

```bash
bun run dev
# відкрити http://localhost:4200
```

## 6. Запустити в production

```bash
# Build
cd packages/web && bun run build:web

# Start
bun run server.ts
# або з кореня:
cd ../.. && bun run start
```

---

## Деплой варіанти

### Railway (найпростіше)
1. Завантажити проект на GitHub
2. Зайти на [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Додати env vars в Settings
4. Railway автоматично запустить `bun run start`

### Render
1. New Web Service → підключити GitHub repo
2. Build command: `cd packages/web && bun run build:web`
3. Start command: `cd packages/web && bun run server.ts`
4. Додати env vars

### VPS (Ubuntu)
```bash
# Встановити Bun
curl -fsSL https://bun.sh/install | bash

# Клонувати і запустити
git clone your-repo
cd tsct-app
bun install
cd packages/web && bun run build:web
PORT=80 bun run server.ts
```

### Docker
```bash
docker build -t tsct-app .
docker run -p 3001:3001 \
  -e DATABASE_URL=... \
  -e DATABASE_AUTH_TOKEN=... \
  tsct-app
```

---

## Логін
- Login: `whatif`
- Password: `whatif2025`
