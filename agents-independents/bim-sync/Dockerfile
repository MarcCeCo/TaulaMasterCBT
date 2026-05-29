FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY shared/ ./shared/
COPY bim-sync/ ./bim-sync/

WORKDIR /app/bim-sync
RUN ../node_modules/.bin/tsc

# ── Imatge final ──────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/bim-sync/dist ./bim-sync/dist

EXPOSE 3003
WORKDIR /app/bim-sync
CMD ["node", "dist/bim-sync/src/server.js"]
