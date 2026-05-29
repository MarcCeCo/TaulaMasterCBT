FROM node:20-alpine AS builder
WORKDIR /app

# Instal·la dependències compartides (package.json de l'arrel agents-independents)
COPY package.json ./
RUN npm install

# Copia shared i aquest agent
COPY shared/ ./shared/
COPY crear-masters/ ./crear-masters/

# Compila
WORKDIR /app/crear-masters
RUN ../node_modules/.bin/tsc

# ── Imatge final lleugera ────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/crear-masters/dist ./crear-masters/dist

EXPOSE 3004
WORKDIR /app/crear-masters
CMD ["node", "dist/src/server.js"]
