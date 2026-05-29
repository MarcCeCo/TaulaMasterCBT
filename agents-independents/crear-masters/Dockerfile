FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY shared/ ./shared/
COPY crear-masters/ ./crear-masters/

WORKDIR /app/crear-masters
RUN ../node_modules/.bin/tsc

# ── Imatge final ──────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/crear-masters/dist ./crear-masters/dist

EXPOSE 3004
WORKDIR /app/crear-masters
CMD ["node", "dist/crear-masters/src/server.js"]
