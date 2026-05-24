FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Instal·la dependències Node
COPY package*.json ./
RUN npm install

# Copia el codi
COPY . .

# Compila TypeScript
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server.js"]
