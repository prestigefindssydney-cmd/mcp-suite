import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY manquante");
  process.exit(1);
}

// Initialise le client Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Cree le serveur MCP
const server = new Server(
  {
    name: "mcp-gemini",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Liste des outils disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description: "Genere une image avec Google Gemini (Imagen 3). Retourne le chemin du fichier sauvegarde.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Description de l'image a generer (en anglais pour de meilleurs resultats)",
            },
            output_path: {
              type: "string",
              description: "Chemin complet ou sauvegarder l'image (ex: C:/Users/quent/image.png)",
            },
            aspect_ratio: {
              type: "string",
              enum: ["1:1", "3:4", "4:3", "9:16", "16:9"],
              description: "Ratio de l'image (defaut: 1:1)",
            },
          },
          required: ["prompt", "output_path"],
        },
      },
      {
        name: "edit_image",
        description: "Edite une image existante avec un prompt. Necessite une image source.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Description des modifications a apporter",
            },
            source_image_path: {
              type: "string",
              description: "Chemin de l'image source a modifier",
            },
            output_path: {
              type: "string",
              description: "Chemin ou sauvegarder l'image modifiee",
            },
          },
          required: ["prompt", "source_image_path", "output_path"],
        },
      },
    ],
  };
});

// Gestionnaire d'appel des outils
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "generate_image") {
      const prompt = args?.prompt as string;
      const outputPath = args?.output_path as string;

      // Utilise Gemini 2.5 Flash Image pour la generation d'images
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-image",
        generationConfig: {
          // @ts-ignore - Image generation config
          responseModalities: ["Text", "Image"],
        },
      });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const candidate = response.candidates?.[0];

      if (!candidate?.content?.parts) {
        throw new Error("Pas de reponse generee");
      }

      // Cherche l'image dans les parts
      for (const part of candidate.content.parts) {
        // @ts-ignore
        if (part.inlineData?.data) {
          // @ts-ignore
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");

          // Cree le dossier si necessaire
          const dir = path.dirname(outputPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(outputPath, buffer);

          return {
            content: [
              {
                type: "text",
                text: `Image generee avec succes!\nChemin: ${outputPath}\nPrompt: ${prompt}`,
              },
            ],
          };
        }
      }

      throw new Error("Pas d'image dans la reponse");
    }

    if (name === "edit_image") {
      const prompt = args?.prompt as string;
      const sourcePath = args?.source_image_path as string;
      const outputPath = args?.output_path as string;

      // Lit l'image source
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Image source introuvable: ${sourcePath}`);
      }

      const imageBuffer = fs.readFileSync(sourcePath);
      const base64Image = imageBuffer.toString("base64");
      const mimeType = sourcePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

      // Utilise Gemini 2.5 Flash Image pour l'edition d'images
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-image",
        generationConfig: {
          // @ts-ignore
          responseModalities: ["Text", "Image"],
        },
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64Image } },
              { text: prompt },
            ],
          },
        ],
      });

      const response = result.response;
      const candidate = response.candidates?.[0];

      if (!candidate?.content?.parts) {
        throw new Error("Pas de reponse generee");
      }

      for (const part of candidate.content.parts) {
        // @ts-ignore
        if (part.inlineData?.data) {
          // @ts-ignore
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");

          const dir = path.dirname(outputPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(outputPath, buffer);

          return {
            content: [
              {
                type: "text",
                text: `Image editee avec succes!\nChemin: ${outputPath}\nPrompt: ${prompt}`,
              },
            ],
          };
        }
      }

      throw new Error("Pas d'image dans la reponse");
    }

    throw new Error(`Outil inconnu: ${name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Erreur: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Demarre le serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Gemini server running on stdio");
}

main().catch(console.error);
