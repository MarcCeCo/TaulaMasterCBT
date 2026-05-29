FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY shared/ ./shared/
COPY visor3d/ ./visor3d/

WORKDIR /app/visor3d
RUN ../node_modules/.bin/tsc

# ── Imatge final ──────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/visor3d/dist ./visor3d/dist

EXPOSE 3002
WORKDIR /app/visor3d
CMD ["node", "dist/visor3d/src/server.js"]
