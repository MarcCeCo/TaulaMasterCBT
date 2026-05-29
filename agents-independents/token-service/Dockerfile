FROM node:20-alpine AS builder
WORKDIR /app

# Instal·la dependències compartides (package.json de l'arrel agents-independents)
COPY package.json ./
RUN npm install

# Copia shared i aquest agent
COPY shared/ ./shared/
COPY token-service/ ./token-service/

# Compila
WORKDIR /app/token-service
RUN ../node_modules/.bin/tsc

# ── Imatge final lleugera ────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/token-service/dist ./token-service/dist

EXPOSE 3001
WORKDIR /app/token-service
CMD ["node", "dist/src/server.js"]
