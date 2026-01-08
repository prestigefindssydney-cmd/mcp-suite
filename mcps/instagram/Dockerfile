# MCP Instagram - Dockerfile
FROM node:20-alpine

WORKDIR /app

# Dependances pour sharp (traitement images)
RUN apk add --no-cache vips-dev python3 make g++

# Copier les fichiers de dependances
COPY package*.json ./
COPY tsconfig.json ./

# Installer les dependances
RUN npm ci

# Copier le code source
COPY src/ ./src/

# Compiler TypeScript
RUN npm run build

# Commande de demarrage (stdio)
CMD ["node", "dist/index.js"]
