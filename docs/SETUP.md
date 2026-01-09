# MCP Suite - Guide d'Installation

## Prerequis

- Docker Desktop installe et demarre
- Claude Code CLI

## Installation

### 1. Cloner le repo

```bash
git clone https://github.com/prestigefindssydney-cmd/mcp-suite.git
cd mcp-suite
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
# Editer .env avec vos credentials
```

### 3. Builder les images Docker

```bash
docker compose build
```

### 4. Configurer Claude Code

Remplacer le contenu de `~/.mcp.json` par :

```json
{
    "mcpServers": {
        "instagram": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-instagram:latest"]
        },
        "gemini": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-gemini:latest"]
        },
        "contabo": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-contabo:latest"]
        },
        "vps": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-vps-ssh:latest"]
        },
        "lemlist": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-lemlist:latest"]
        },
        "canva": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-canva:latest"]
        },
        "vertex-rag": {
            "command": "docker",
            "args": ["run", "--rm", "-i", "--env-file", "/chemin/vers/mcp-suite/.env", "mcp-vertex-rag:latest"]
        }
    }
}
```

### 5. Redemarrer Claude Code

```bash
# Fermer et relancer Claude Code
claude
```

## Test des MCPs

### Test rapide (tools/list)

```bash
cd mcp-suite
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | docker run --rm -i --env-file .env mcp-contabo:latest
```

### Test complet

```bash
./scripts/test-all-mcps.sh
```

## MCPs Inclus

| MCP | Description | Tools |
|-----|-------------|-------|
| contabo | API VPS Contabo | 20 |
| lemlist | Campagnes email Lemlist | 19 |
| gemini | Generation images Gemini | 2 |
| vps-ssh | Commandes SSH VPS | 10 |
| instagram | API Instagram complete | 53 |
| canva | Automation Canva | 8 |
| vertex-rag | RAG avec Vertex AI | 9 |

**Total : 121 tools**

## Troubleshooting

### Docker Desktop not running

```
ERROR: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

**Solution** : Lancer Docker Desktop et attendre que le daemon soit pret.

### npm ci failed (package-lock.json missing)

Les Dockerfiles utilisent `npm install` au lieu de `npm ci` car certains MCPs n'ont pas de package-lock.json.

### Vertex-RAG initialization error

Ce MCP necessite une initialisation MCP complete (pas juste tools/list). Claude Code gere ca automatiquement.
