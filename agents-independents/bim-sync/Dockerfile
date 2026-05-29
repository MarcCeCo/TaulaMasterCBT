FROM node:20-alpine AS builder
WORKDIR /app

# Instal·la dependències compartides (package.json de l'arrel agents-independents)
COPY package.json ./
RUN npm install

# Copia shared i aquest agent
COPY shared/ ./shared/
COPY bim-sync/ ./bim-sync/

# Compila
WORKDIR /app/bim-sync
RUN ../node_modules/.bin/tsc

# ── Imatge final lleugera ────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/bim-sync/dist ./bim-sync/dist

EXPOSE 3003
WORKDIR /app/bim-sync
CMD ["node", "dist/src/server.js"]
