# MCP VPS SSH - Dockerfile
FROM node:20-alpine

WORKDIR /app

# Dependances pour ssh2 (compilation native)
RUN apk add --no-cache python3 make g++

# Copier les fichiers de dependances
COPY package*.json ./

# Installer les dependances
RUN npm ci

# Copier le code source
COPY index.js ./

# Commande de demarrage (stdio)
CMD ["node", "index.js"]
