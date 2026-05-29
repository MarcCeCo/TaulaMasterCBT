FROM node:20-alpine
WORKDIR /app

# Copia shared i el servei concret
COPY shared/ ./shared/
COPY crear-masters/package*.json ./crear-masters/
RUN cd crear-masters && npm install

COPY crear-masters/ ./crear-masters/
RUN cd crear-masters && npm run build

EXPOSE 3004
WORKDIR /app/crear-masters
CMD ["node", "dist/src/server.js"]
