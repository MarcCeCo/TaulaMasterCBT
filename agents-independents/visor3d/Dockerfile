FROM node:20-alpine
WORKDIR /app

# Copia package.json arrel (dependències compartides) i instal·la
COPY package.json ./
RUN npm install

# Copia shared i l'agent concret
COPY shared/ ./shared/
COPY visor3d/ ./visor3d/

# Compila des de la carpeta de l'agent
WORKDIR /app/visor3d
RUN ../node_modules/.bin/tsc

EXPOSE 3002
CMD ["node", "dist/src/server.js"]
