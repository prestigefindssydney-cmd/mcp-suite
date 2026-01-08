# MCP Vertex RAG - Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Installation des dependances systeme
RUN apt-get update && apt-get install -y \
    build-essential \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copier les fichiers de dependances
COPY requirements.txt ./

# Installer les dependances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source
COPY server.py ./

# Commande de demarrage (stdio)
CMD ["python", "server.py"]
