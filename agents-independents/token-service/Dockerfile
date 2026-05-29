FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY shared/ ./shared/
COPY token-service/ ./token-service/

WORKDIR /app/token-service
RUN ../node_modules/.bin/tsc

# ── Imatge final ──────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/token-service/dist ./token-service/dist

EXPOSE 3001
WORKDIR /app/token-service
CMD ["node", "dist/token-service/src/server.js"]
