FROM node:20-alpine
WORKDIR /app

# Copia package.json arrel (dependències compartides) i instal·la
COPY package.json ./
RUN npm install

# Copia shared i l'agent concret
COPY shared/ ./shared/
COPY token-service/ ./token-service/

# Compila des de la carpeta de l'agent
WORKDIR /app/token-service
RUN ../node_modules/.bin/tsc

EXPOSE 3001
CMD ["node", "dist/src/server.js"]
