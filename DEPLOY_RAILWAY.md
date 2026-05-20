# Deploy to Railway

## Що підготовлено
- `packages/web/Dockerfile` — production build (Bun + Vite)
- `packages/web/server.ts` — production сервер (static + API)
- `packages/web/railway.toml` — Railway конфіг

## Покроково

### 1. Залий код на GitHub
```bash
cd /home/user/tsct-app
git init          # якщо ще не ініціалізовано
git add .
git commit -m "railway deploy"
```
Потім створи новий репозиторій на github.com і:
```bash
git remote add origin https://github.com/YOUR_USER/tsct-app.git
git push -u origin main
```

### 2. Створи проект на Railway
- Зайди на **railway.app** → New Project → Deploy from GitHub repo
- Вибери свій репозиторій
- Railway автоматично знайде `Dockerfile`

### 3. Налаштуй Root Directory
У налаштуваннях сервісу → **Settings → Source → Root Directory**:
```
packages/web
```

### 4. Додай Environment Variables
У Railway → Variables → додай:
```
DATABASE_URL=libsql://8b9d48c1-ab53-45c2-b97c-da31ea40074c-runable.aws-us-east-2.turso.io
DATABASE_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
NODE_ENV=production
```

### 5. Deploy
Railway сам збилдить і задеплоїть. Отримаєш URL типу:
`https://tsct-app-production.up.railway.app`

## Безкоштовний ліміт Railway
- 500 год/міс на hobby plan (безкоштовно)
- При перевищенні — $5/міс
