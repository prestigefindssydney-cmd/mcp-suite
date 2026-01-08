# MCP Suite

Suite de serveurs MCP (Model Context Protocol) dockerisés pour Claude Code.

## Structure

```
mcp-suite/
├── mcps/
│   ├── gemini/        # Génération d'images (Google Gemini)
│   ├── lemlist/       # Email automation
│   ├── contabo/       # API VPS Contabo
│   ├── instagram/     # Gestion compte Instagram
│   ├── canva/         # Création de designs
│   ├── vertex-rag/    # RAG avec Google Vertex AI
│   └── vps-ssh/       # Commandes SSH sur VPS
├── docker-compose.yml
├── .env.example
└── scripts/
    └── build-all.sh
```

## Prérequis

- Docker Desktop
- Clés API (voir `.env.example`)

## Installation

1. Cloner le repo
```bash
git clone https://github.com/barbar-lab/mcp-suite.git
cd mcp-suite
```

2. Copier et remplir les variables d'environnement
```bash
cp .env.example .env
# Éditer .env avec vos clés API
```

3. Builder les images
```bash
docker compose build
```

## Utilisation avec Claude Code

Modifier `~/.mcp.json` pour utiliser les MCPs dockerisés :

```json
{
  "gemini": {
    "command": "docker",
    "args": ["run", "--rm", "-i", "--env-file", ".env", "mcp-gemini:latest"]
  }
}
```

## MCPs Disponibles

| MCP | Description | Variables requises |
|-----|-------------|-------------------|
| gemini | Génération d'images | `GEMINI_API_KEY` |
| lemlist | Email automation | `LEMLIST_API_KEY` |
| contabo | API VPS | `CONTABO_CLIENT_ID`, `CONTABO_CLIENT_SECRET`, `CONTABO_API_USER`, `CONTABO_API_PASSWORD` |
| instagram | Gestion Instagram | `INSTAGRAM_SESSION_ID`, `INSTAGRAM_CSRF_TOKEN`, `INSTAGRAM_USER_ID` |
| canva | Création designs | `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET` |
| vertex-rag | RAG Vertex AI | `GOOGLE_PROJECT_ID`, `GOOGLE_LOCATION` |
| vps-ssh | SSH sur VPS | `VPS_HOST`, `VPS_USER`, `VPS_PORT` |

## Développement

Chaque MCP a son propre Dockerfile et peut être buildé individuellement :

```bash
cd mcps/gemini
docker build -t mcp-gemini:latest .
```

## License

MIT
