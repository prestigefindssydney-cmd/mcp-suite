# MCP Contabo - Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copier les fichiers de dependances
COPY package*.json ./

# Installer les dependances
RUN npm ci

# Copier le code source
COPY index.js ./

# Commande de demarrage (stdio)
CMD ["node", "index.js"]
