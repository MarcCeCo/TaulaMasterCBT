FROM node:20-alpine AS builder
WORKDIR /app

# Instal·la dependències compartides (package.json de l'arrel agents-independents)
COPY package.json ./
RUN npm install

# Copia shared i aquest agent
COPY shared/ ./shared/
COPY visor3d/ ./visor3d/

# Compila
WORKDIR /app/visor3d
RUN ../node_modules/.bin/tsc

# ── Imatge final lleugera ────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/visor3d/dist ./visor3d/dist

EXPOSE 3002
WORKDIR /app/visor3d
CMD ["node", "dist/src/server.js"]
