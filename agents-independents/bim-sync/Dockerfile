FROM node:20-alpine
WORKDIR /app

# Copia package.json arrel (dependències compartides) i instal·la
COPY package.json ./
RUN npm install

# Copia shared i l'agent concret
COPY shared/ ./shared/
COPY bim-sync/ ./bim-sync/

# Compila des de la carpeta de l'agent
WORKDIR /app/bim-sync
RUN ../node_modules/.bin/tsc

EXPOSE 3003
CMD ["node", "dist/src/server.js"]
