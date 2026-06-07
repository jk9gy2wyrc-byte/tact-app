FROM oven/bun:1.3 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY packages/web/package.json ./packages/web/

# Install deps (web only)
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source
COPY packages/web ./packages/web

# Build
WORKDIR /app/packages/web
RUN bun run build:web

# ---- Runtime ----
FROM oven/bun:1.3

# OCR tools for trade screenshot parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/packages/web

COPY --from=builder /app/packages/web/dist ./dist
COPY --from=builder /app/packages/web/src ./src
COPY --from=builder /app/packages/web/server.ts ./server.ts
COPY --from=builder /app/packages/web/package.json ./package.json
COPY --from=builder /app/packages/web/node_modules ./node_modules
COPY --from=builder /app/node_modules /app/node_modules

ENV PORT=3001
EXPOSE 3001

CMD ["bun", "run", "server.ts"]
