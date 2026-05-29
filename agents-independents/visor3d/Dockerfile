FROM node:20-alpine
WORKDIR /app

# Copia shared i el servei concret
COPY shared/ ./shared/
COPY visor3d/package*.json ./visor3d/
RUN cd visor3d && npm install

COPY visor3d/ ./visor3d/
RUN cd visor3d && npm run build

EXPOSE 3002
WORKDIR /app/visor3d
CMD ["node", "dist/src/server.js"]
