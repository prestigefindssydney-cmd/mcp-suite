#!/usr/bin/env node
/**
 * MCP Server pour Lemlist API
 * Permet de gerer les campagnes et leads Lemlist depuis Claude
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const LEMLIST_API_KEY = process.env.LEMLIST_API_KEY || "";
const BASE_URL = "https://api.lemlist.com/api";

/**
 * Effectue une requete vers l'API Lemlist
 */
async function lemlistRequest(
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const auth = Buffer.from(`:${LEMLIST_API_KEY}`).toString("base64");

  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Lemlist API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Definition des outils MCP
const tools: Tool[] = [
  {
    name: "list_campaigns",
    description: "Liste toutes les campagnes Lemlist",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Nombre max de campagnes (defaut: 50)",
        },
        offset: {
          type: "number",
          description: "Offset pour pagination",
        },
      },
    },
  },
  {
    name: "get_campaign",
    description: "Recupere les details d'une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "add_lead_to_campaign",
    description: "Ajoute un lead a une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
        firstName: {
          type: "string",
          description: "Prenom",
        },
        lastName: {
          type: "string",
          description: "Nom",
        },
        companyName: {
          type: "string",
          description: "Nom de l'entreprise",
        },
        linkedinUrl: {
          type: "string",
          description: "URL LinkedIn",
        },
        phone: {
          type: "string",
          description: "Telephone",
        },
        customVariables: {
          type: "object",
          description: "Variables personnalisees (ex: {city: 'Paris'})",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "list_campaign_leads",
    description: "Liste les leads d'une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        limit: {
          type: "number",
          description: "Nombre max de leads",
        },
        offset: {
          type: "number",
          description: "Offset pour pagination",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "get_lead",
    description: "Recupere un lead par email",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "update_lead",
    description: "Met a jour un lead dans une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
        firstName: {
          type: "string",
          description: "Nouveau prenom",
        },
        lastName: {
          type: "string",
          description: "Nouveau nom",
        },
        companyName: {
          type: "string",
          description: "Nouveau nom d'entreprise",
        },
        customVariables: {
          type: "object",
          description: "Variables personnalisees a mettre a jour",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "mark_lead_interested",
    description: "Marque un lead comme interesse",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "mark_lead_not_interested",
    description: "Marque un lead comme non interesse",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "pause_lead",
    description: "Met en pause un lead dans une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "resume_lead",
    description: "Reprend l'envoi pour un lead",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "delete_lead",
    description: "Supprime un lead d'une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["campaign_id", "email"],
    },
  },
  {
    name: "unsubscribe_lead",
    description: "Desinscrit un lead (ajoute a la liste de desabonnement)",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email du lead",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "update_campaign",
    description: "Met a jour une campagne (nom, parametres)",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
        name: {
          type: "string",
          description: "Nouveau nom de la campagne",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "get_sequences",
    description: "Recupere les sequences et leurs etapes pour une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "create_step",
    description: "Cree une etape dans une sequence (email, linkedin, etc). Types: email, linkedinInvite, linkedinSend, linkedinVisit, manual, phone, api, whatsappMessage",
    inputSchema: {
      type: "object",
      properties: {
        sequence_id: {
          type: "string",
          description: "ID de la sequence",
        },
        type: {
          type: "string",
          description: "Type d'etape: email, linkedinInvite, linkedinSend, linkedinVisit, manual, phone, api, whatsappMessage",
        },
        subject: {
          type: "string",
          description: "Objet (pour email)",
        },
        message: {
          type: "string",
          description: "Contenu du message (HTML pour email)",
        },
        delay: {
          type: "number",
          description: "Delai en jours avant cette etape (0 pour premiere etape)",
        },
        index: {
          type: "number",
          description: "Position dans la sequence",
        },
      },
      required: ["sequence_id", "type"],
    },
  },
  {
    name: "update_step",
    description: "Met a jour une etape de sequence",
    inputSchema: {
      type: "object",
      properties: {
        sequence_id: {
          type: "string",
          description: "ID de la sequence",
        },
        step_id: {
          type: "string",
          description: "ID de l'etape",
        },
        subject: {
          type: "string",
          description: "Nouvel objet (pour email)",
        },
        message: {
          type: "string",
          description: "Nouveau contenu du message",
        },
        delay: {
          type: "number",
          description: "Nouveau delai en jours",
        },
      },
      required: ["sequence_id", "step_id"],
    },
  },
  {
    name: "delete_step",
    description: "Supprime une etape de sequence",
    inputSchema: {
      type: "object",
      properties: {
        sequence_id: {
          type: "string",
          description: "ID de la sequence",
        },
        step_id: {
          type: "string",
          description: "ID de l'etape",
        },
      },
      required: ["sequence_id", "step_id"],
    },
  },
  {
    name: "start_campaign",
    description: "Demarre une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "pause_campaign",
    description: "Met en pause une campagne",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "ID de la campagne",
        },
      },
      required: ["campaign_id"],
    },
  },
];

// Gestionnaire d'appels d'outils
async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "list_campaigns": {
        const limit = (args.limit as number) || 50;
        const offset = (args.offset as number) || 0;
        const result = await lemlistRequest(`/campaigns?limit=${limit}&offset=${offset}`);
        return JSON.stringify(result, null, 2);
      }

      case "get_campaign": {
        const result = await lemlistRequest(`/campaigns/${args.campaign_id}`);
        return JSON.stringify(result, null, 2);
      }

      case "add_lead_to_campaign": {
        const { campaign_id, ...leadData } = args;
        const result = await lemlistRequest(
          `/campaigns/${campaign_id}/leads`,
          "POST",
          leadData as Record<string, unknown>
        );
        return JSON.stringify(result, null, 2);
      }

      case "list_campaign_leads": {
        const limit = (args.limit as number) || 100;
        const offset = (args.offset as number) || 0;
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/leads?limit=${limit}&offset=${offset}`
        );
        return JSON.stringify(result, null, 2);
      }

      case "get_lead": {
        const result = await lemlistRequest(`/leads/${encodeURIComponent(args.email as string)}`);
        return JSON.stringify(result, null, 2);
      }

      case "update_lead": {
        const { campaign_id, email, ...updateData } = args;
        const result = await lemlistRequest(
          `/campaigns/${campaign_id}/leads/${encodeURIComponent(email as string)}`,
          "PATCH",
          updateData as Record<string, unknown>
        );
        return JSON.stringify(result, null, 2);
      }

      case "mark_lead_interested": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/leads/${encodeURIComponent(args.email as string)}/interested`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      case "mark_lead_not_interested": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/leads/${encodeURIComponent(args.email as string)}/notInterested`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      case "pause_lead": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/leads/${encodeURIComponent(args.email as string)}/pause`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      case "resume_lead": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/leads/${encodeURIComponent(args.email as string)}/resume`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      case "delete_lead": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/leads/${encodeURIComponent(args.email as string)}`,
          "DELETE"
        );
        return JSON.stringify(result, null, 2);
      }

      case "unsubscribe_lead": {
        const result = await lemlistRequest(
          `/unsubscribes/${encodeURIComponent(args.email as string)}`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      case "update_campaign": {
        const { campaign_id, ...updateData } = args;
        const result = await lemlistRequest(
          `/campaigns/${campaign_id}`,
          "PATCH",
          updateData as Record<string, unknown>
        );
        return JSON.stringify(result, null, 2);
      }

      case "get_sequences": {
        const result = await lemlistRequest(`/campaigns/${args.campaign_id}/sequences`);
        return JSON.stringify(result, null, 2);
      }

      case "create_step": {
        const { sequence_id, ...stepData } = args;
        const result = await lemlistRequest(
          `/sequences/${sequence_id}/steps`,
          "POST",
          stepData as Record<string, unknown>
        );
        return JSON.stringify(result, null, 2);
      }

      case "update_step": {
        const { sequence_id, step_id, ...updateData } = args;
        const result = await lemlistRequest(
          `/sequences/${sequence_id}/steps/${step_id}`,
          "PATCH",
          updateData as Record<string, unknown>
        );
        return JSON.stringify(result, null, 2);
      }

      case "delete_step": {
        const result = await lemlistRequest(
          `/sequences/${args.sequence_id}/steps/${args.step_id}`,
          "DELETE"
        );
        return JSON.stringify(result, null, 2);
      }

      case "start_campaign": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/start`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      case "pause_campaign": {
        const result = await lemlistRequest(
          `/campaigns/${args.campaign_id}/pause`,
          "POST"
        );
        return JSON.stringify(result, null, 2);
      }

      default:
        return `Outil inconnu: ${name}`;
    }
  } catch (error) {
    return `Erreur: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Initialisation du serveur MCP
async function main() {
  if (!LEMLIST_API_KEY) {
    console.error("LEMLIST_API_KEY non definie. Configurez la variable d'environnement.");
    process.exit(1);
  }

  const server = new Server(
    {
      name: "lemlist-mcp",
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
    tools,
  }));

  // Handler pour executer les outils
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await handleToolCall(name, args as Record<string, unknown>);
    return {
      content: [{ type: "text", text: result }],
    };
  });

  // Demarrage du serveur
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lemlist MCP Server demarre");
}

main().catch(console.error);
