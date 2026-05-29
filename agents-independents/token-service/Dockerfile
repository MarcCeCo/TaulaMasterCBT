FROM node:20-alpine
WORKDIR /app

# Copia shared i el servei concret
COPY shared/ ./shared/
COPY token-service/package*.json ./token-service/
RUN cd token-service && npm install

COPY token-service/ ./token-service/
RUN cd token-service && npm run build

EXPOSE 3001
WORKDIR /app/token-service
CMD ["node", "dist/src/server.js"]
