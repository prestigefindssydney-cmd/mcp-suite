#!/usr/bin/env node

/**
 * MCP Server pour l'API Contabo
 * Permet de gerer les VPS/VDS, snapshots, images, reseaux prives
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration API Contabo
const CONTABO_AUTH_URL = "https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token";
const CONTABO_API_URL = "https://api.contabo.com/v1";

// Cache du token
let accessToken = null;
let tokenExpiry = null;

/**
 * Genere un UUID v4 pour les headers x-request-id
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Obtient un token d'acces OAuth2
 */
async function getAccessToken() {
  // Retourne le token cache s'il est encore valide
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const params = new URLSearchParams({
    client_id: process.env.CONTABO_CLIENT_ID,
    client_secret: process.env.CONTABO_CLIENT_SECRET,
    username: process.env.CONTABO_API_USER,
    password: process.env.CONTABO_API_PASSWORD,
    grant_type: "password",
  });

  const response = await fetch(CONTABO_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur authentification Contabo: ${error}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  // Expire 60 secondes avant pour eviter les problemes
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return accessToken;
}

/**
 * Effectue une requete a l'API Contabo
 */
async function contaboRequest(method, endpoint, body = null) {
  const token = await getAccessToken();

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-request-id": generateUUID(),
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${CONTABO_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur API Contabo (${response.status}): ${error}`);
  }

  // Certaines requetes DELETE retournent 204 sans contenu
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

// Definition des outils MCP
const TOOLS = [
  // === INSTANCES ===
  {
    name: "list_instances",
    description: "Liste toutes les instances VPS/VDS Contabo",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Numero de page (defaut: 1)" },
        size: { type: "number", description: "Nombre par page (defaut: 100)" },
        name: { type: "string", description: "Filtrer par nom" },
        status: { type: "string", description: "Filtrer par status (running, stopped, etc.)" },
      },
    },
  },
  {
    name: "get_instance",
    description: "Recupere les details d'une instance specifique",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
      },
      required: ["instanceId"],
    },
  },
  {
    name: "start_instance",
    description: "Demarre une instance VPS/VDS",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
      },
      required: ["instanceId"],
    },
  },
  {
    name: "stop_instance",
    description: "Arrete une instance VPS/VDS",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
      },
      required: ["instanceId"],
    },
  },
  {
    name: "restart_instance",
    description: "Redemarre une instance VPS/VDS",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
      },
      required: ["instanceId"],
    },
  },
  {
    name: "reinstall_instance",
    description: "Reinstalle une instance avec une nouvelle image",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
        imageId: { type: "string", description: "ID de l'image a installer" },
        sshKeys: { type: "array", items: { type: "number" }, description: "IDs des cles SSH" },
        rootPassword: { type: "number", description: "ID du secret pour le mot de passe root" },
      },
      required: ["instanceId", "imageId"],
    },
  },

  // === SNAPSHOTS ===
  {
    name: "list_snapshots",
    description: "Liste les snapshots d'une instance",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
      },
      required: ["instanceId"],
    },
  },
  {
    name: "create_snapshot",
    description: "Cree un snapshot d'une instance",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
        name: { type: "string", description: "Nom du snapshot" },
        description: { type: "string", description: "Description du snapshot" },
      },
      required: ["instanceId", "name"],
    },
  },
  {
    name: "delete_snapshot",
    description: "Supprime un snapshot",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
        snapshotId: { type: "string", description: "ID du snapshot" },
      },
      required: ["instanceId", "snapshotId"],
    },
  },
  {
    name: "rollback_snapshot",
    description: "Restaure une instance depuis un snapshot",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
        snapshotId: { type: "string", description: "ID du snapshot" },
      },
      required: ["instanceId", "snapshotId"],
    },
  },

  // === IMAGES ===
  {
    name: "list_images",
    description: "Liste toutes les images disponibles (OS, custom)",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Numero de page" },
        size: { type: "number", description: "Nombre par page" },
        name: { type: "string", description: "Filtrer par nom" },
        standardImage: { type: "boolean", description: "Filtrer images standard" },
      },
    },
  },

  // === SECRETS (SSH Keys, Passwords) ===
  {
    name: "list_secrets",
    description: "Liste les secrets (cles SSH, mots de passe)",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Numero de page" },
        size: { type: "number", description: "Nombre par page" },
        type: { type: "string", description: "Type: ssh ou password" },
      },
    },
  },
  {
    name: "create_secret",
    description: "Cree un nouveau secret (cle SSH ou mot de passe)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nom du secret" },
        type: { type: "string", description: "Type: ssh ou password" },
        value: { type: "string", description: "Valeur (cle publique SSH ou mot de passe)" },
      },
      required: ["name", "type", "value"],
    },
  },

  // === PRIVATE NETWORKS ===
  {
    name: "list_private_networks",
    description: "Liste les reseaux prives (VPC)",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Numero de page" },
        size: { type: "number", description: "Nombre par page" },
      },
    },
  },
  {
    name: "create_private_network",
    description: "Cree un nouveau reseau prive",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nom du reseau" },
        description: { type: "string", description: "Description" },
        region: { type: "string", description: "Region (EU, US-central, etc.)" },
      },
      required: ["name", "region"],
    },
  },
  {
    name: "assign_instance_to_network",
    description: "Assigne une instance a un reseau prive",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "number", description: "ID de l'instance" },
        privateNetworkId: { type: "number", description: "ID du reseau prive" },
      },
      required: ["instanceId", "privateNetworkId"],
    },
  },

  // === TAGS ===
  {
    name: "list_tags",
    description: "Liste tous les tags",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_tag",
    description: "Cree un nouveau tag",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nom du tag" },
        color: { type: "string", description: "Couleur hex (ex: #FF5733)" },
      },
      required: ["name"],
    },
  },

  // === OBJECT STORAGE ===
  {
    name: "list_object_storages",
    description: "Liste les Object Storages S3",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Numero de page" },
        size: { type: "number", description: "Nombre par page" },
      },
    },
  },
  {
    name: "get_object_storage_stats",
    description: "Recupere les stats d'un Object Storage",
    inputSchema: {
      type: "object",
      properties: {
        objectStorageId: { type: "string", description: "ID de l'Object Storage" },
      },
      required: ["objectStorageId"],
    },
  },
];

// Handler pour executer les outils
async function handleTool(name, args) {
  switch (name) {
    // === INSTANCES ===
    case "list_instances": {
      const params = new URLSearchParams();
      if (args.page) params.append("page", args.page);
      if (args.size) params.append("size", args.size);
      if (args.name) params.append("name", args.name);
      if (args.status) params.append("status", args.status);
      const query = params.toString() ? `?${params}` : "";
      return contaboRequest("GET", `/compute/instances${query}`);
    }

    case "get_instance":
      return contaboRequest("GET", `/compute/instances/${args.instanceId}`);

    case "start_instance":
      return contaboRequest("POST", `/compute/instances/${args.instanceId}/actions/start`);

    case "stop_instance":
      return contaboRequest("POST", `/compute/instances/${args.instanceId}/actions/stop`);

    case "restart_instance":
      return contaboRequest("POST", `/compute/instances/${args.instanceId}/actions/restart`);

    case "reinstall_instance": {
      const body = { imageId: args.imageId };
      if (args.sshKeys) body.sshKeys = args.sshKeys;
      if (args.rootPassword) body.rootPassword = args.rootPassword;
      return contaboRequest("PUT", `/compute/instances/${args.instanceId}`, body);
    }

    // === SNAPSHOTS ===
    case "list_snapshots":
      return contaboRequest("GET", `/compute/instances/${args.instanceId}/snapshots`);

    case "create_snapshot":
      return contaboRequest("POST", `/compute/instances/${args.instanceId}/snapshots`, {
        name: args.name,
        description: args.description || "",
      });

    case "delete_snapshot":
      return contaboRequest(
        "DELETE",
        `/compute/instances/${args.instanceId}/snapshots/${args.snapshotId}`
      );

    case "rollback_snapshot":
      return contaboRequest(
        "POST",
        `/compute/instances/${args.instanceId}/snapshots/${args.snapshotId}/rollback`
      );

    // === IMAGES ===
    case "list_images": {
      const params = new URLSearchParams();
      if (args.page) params.append("page", args.page);
      if (args.size) params.append("size", args.size);
      if (args.name) params.append("name", args.name);
      if (args.standardImage !== undefined) params.append("standardImage", args.standardImage);
      const query = params.toString() ? `?${params}` : "";
      return contaboRequest("GET", `/compute/images${query}`);
    }

    // === SECRETS ===
    case "list_secrets": {
      const params = new URLSearchParams();
      if (args.page) params.append("page", args.page);
      if (args.size) params.append("size", args.size);
      if (args.type) params.append("type", args.type);
      const query = params.toString() ? `?${params}` : "";
      return contaboRequest("GET", `/secrets${query}`);
    }

    case "create_secret":
      return contaboRequest("POST", "/secrets", {
        name: args.name,
        type: args.type,
        value: args.value,
      });

    // === PRIVATE NETWORKS ===
    case "list_private_networks": {
      const params = new URLSearchParams();
      if (args.page) params.append("page", args.page);
      if (args.size) params.append("size", args.size);
      const query = params.toString() ? `?${params}` : "";
      return contaboRequest("GET", `/private-networks${query}`);
    }

    case "create_private_network":
      return contaboRequest("POST", "/private-networks", {
        name: args.name,
        description: args.description || "",
        region: args.region,
      });

    case "assign_instance_to_network":
      return contaboRequest(
        "POST",
        `/private-networks/${args.privateNetworkId}/instances/${args.instanceId}`
      );

    // === TAGS ===
    case "list_tags":
      return contaboRequest("GET", "/tags");

    case "create_tag":
      return contaboRequest("POST", "/tags", {
        name: args.name,
        color: args.color || "#0080FF",
      });

    // === OBJECT STORAGE ===
    case "list_object_storages": {
      const params = new URLSearchParams();
      if (args.page) params.append("page", args.page);
      if (args.size) params.append("size", args.size);
      const query = params.toString() ? `?${params}` : "";
      return contaboRequest("GET", `/object-storages${query}`);
    }

    case "get_object_storage_stats":
      return contaboRequest("GET", `/object-storages/${args.objectStorageId}/stats`);

    default:
      throw new Error(`Outil inconnu: ${name}`);
  }
}

// Creation du serveur MCP
const server = new Server(
  {
    name: "mcp-contabo",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handler pour lister les outils
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handler pour executer les outils
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args || {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Erreur: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Demarrage du serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Contabo server running on stdio");
}

main().catch(console.error);
