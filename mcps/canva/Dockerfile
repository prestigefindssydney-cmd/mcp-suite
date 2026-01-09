# MCP Canva - Dockerfile avec Chromium
FROM node:20-slim

# Installation de Chromium et dependances
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configuration Puppeteer pour utiliser Chromium systeme
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copier les fichiers de dependances
COPY package*.json ./

# Installer les dependances
RUN npm install

# Copier le code source
COPY index.js ./

# Creer le dossier pour le profil Chrome
RUN mkdir -p /app/.chrome-profile

# Commande de demarrage (stdio)
CMD ["node", "index.js"]
