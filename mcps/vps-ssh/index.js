#!/usr/bin/env node

/**
 * MCP Server pour controler le VPS via SSH
 * Permet d'executer des commandes, transferer des fichiers, etc.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "ssh2";

const VPS_CONFIG = {
  host: process.env.VPS_HOST,
  port: parseInt(process.env.VPS_PORT) || 22,
  username: process.env.VPS_USER,
  password: process.env.VPS_PASSWORD,
};

/**
 * Execute une commande SSH sur le VPS
 */
function executeSSH(command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = "";
    let errorOutput = "";

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("Timeout: commande trop longue"));
    }, timeout);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        stream.on("close", (code) => {
          clearTimeout(timer);
          conn.end();
          resolve({
            exitCode: code,
            stdout: output,
            stderr: errorOutput,
          });
        });

        stream.on("data", (data) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect(VPS_CONFIG);
  });
}

// Definition des outils MCP
const TOOLS = [
  {
    name: "ssh_exec",
    description: "Execute une commande shell sur le VPS Contabo. Utilisez pour installer des packages, gerer des services, voir des logs, etc.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "La commande bash a executer sur le VPS",
        },
        timeout: {
          type: "number",
          description: "Timeout en ms (defaut: 30000)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "ssh_status",
    description: "Affiche le status du VPS (uptime, CPU, RAM, disque)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ssh_processes",
    description: "Liste les processus en cours sur le VPS",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Filtrer par nom de processus (optionnel)",
        },
      },
    },
  },
  {
    name: "ssh_logs",
    description: "Affiche les logs systeme ou d'un service specifique",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Nom du service (ex: nginx, docker). Si vide, logs systeme.",
        },
        lines: {
          type: "number",
          description: "Nombre de lignes (defaut: 50)",
        },
      },
    },
  },
  {
    name: "ssh_file_read",
    description: "Lit le contenu d'un fichier sur le VPS",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Chemin du fichier a lire",
        },
        lines: {
          type: "number",
          description: "Nombre de lignes max (defaut: 100)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "ssh_file_write",
    description: "Ecrit du contenu dans un fichier sur le VPS",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Chemin du fichier",
        },
        content: {
          type: "string",
          description: "Contenu a ecrire",
        },
        append: {
          type: "boolean",
          description: "Ajouter au fichier existant (defaut: false = remplacer)",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "ssh_service",
    description: "Gere un service systemd (start, stop, restart, status, enable, disable)",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Nom du service",
        },
        action: {
          type: "string",
          enum: ["start", "stop", "restart", "status", "enable", "disable"],
          description: "Action a effectuer",
        },
      },
      required: ["service", "action"],
    },
  },
  {
    name: "ssh_install",
    description: "Installe un ou plusieurs packages via apt",
    inputSchema: {
      type: "object",
      properties: {
        packages: {
          type: "string",
          description: "Packages a installer (separes par des espaces)",
        },
      },
      required: ["packages"],
    },
  },
  {
    name: "ssh_docker",
    description: "Execute une commande Docker sur le VPS",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Commande docker (ex: ps, images, logs container_name)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "ssh_ports",
    description: "Liste les ports ouverts et les services qui ecoutent",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Handler pour executer les outils
async function handleTool(name, args) {
  switch (name) {
    case "ssh_exec":
      return executeSSH(args.command, args.timeout || 30000);

    case "ssh_status": {
      const commands = [
        "echo '=== HOSTNAME ===' && hostname",
        "echo '=== UPTIME ===' && uptime",
        "echo '=== CPU ===' && top -bn1 | head -5",
        "echo '=== MEMOIRE ===' && free -h",
        "echo '=== DISQUE ===' && df -h /",
        "echo '=== IP ===' && hostname -I",
      ];
      return executeSSH(commands.join(" && "));
    }

    case "ssh_processes": {
      const cmd = args.filter
        ? `ps aux | grep -i "${args.filter}" | grep -v grep`
        : "ps aux --sort=-%mem | head -20";
      return executeSSH(cmd);
    }

    case "ssh_logs": {
      const lines = args.lines || 50;
      const cmd = args.service
        ? `journalctl -u ${args.service} -n ${lines} --no-pager`
        : `journalctl -n ${lines} --no-pager`;
      return executeSSH(cmd);
    }

    case "ssh_file_read": {
      const lines = args.lines || 100;
      return executeSSH(`head -n ${lines} "${args.path}"`);
    }

    case "ssh_file_write": {
      const operator = args.append ? ">>" : ">";
      // Escape le contenu pour le shell
      const escaped = args.content.replace(/'/g, "'\\''");
      return executeSSH(`echo '${escaped}' ${operator} "${args.path}"`);
    }

    case "ssh_service":
      return executeSSH(`systemctl ${args.action} ${args.service}`);

    case "ssh_install":
      return executeSSH(
        `apt-get update && apt-get install -y ${args.packages}`,
        120000
      );

    case "ssh_docker":
      return executeSSH(`docker ${args.command}`);

    case "ssh_ports":
      return executeSSH("ss -tlnp");

    default:
      throw new Error(`Outil inconnu: ${name}`);
  }
}

// Creation du serveur MCP
const server = new Server(
  {
    name: "mcp-vps-ssh",
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
    const output =
      typeof result === "string"
        ? result
        : `Exit code: ${result.exitCode}\n\n${result.stdout}${result.stderr ? "\n\nSTDERR:\n" + result.stderr : ""}`;

    return {
      content: [{ type: "text", text: output }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Erreur: ${error.message}` }],
      isError: true,
    };
  }
});

// Demarrage du serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP VPS SSH server running on stdio");
}

main().catch(console.error);
