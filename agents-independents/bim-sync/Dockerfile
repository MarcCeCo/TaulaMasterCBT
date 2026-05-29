FROM node:20-alpine
WORKDIR /app

# Copia shared i el servei concret
COPY shared/ ./shared/
COPY bim-sync/package*.json ./bim-sync/
RUN cd bim-sync && npm install

COPY bim-sync/ ./bim-sync/
RUN cd bim-sync && npm run build

EXPOSE 3003
WORKDIR /app/bim-sync
CMD ["node", "dist/src/server.js"]
