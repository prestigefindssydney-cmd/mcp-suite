#!/usr/bin/env node
/**
 * MCP Canva v5.0 - Puppeteer Stealth
 * Utilise un vrai navigateur pour bypasser Cloudflare
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");

puppeteer.use(StealthPlugin());

const CONFIG = {
  userDataDir: path.join(__dirname, ".chrome-profile"),
  headless: true
};

let browser = null;
let page = null;

async function initBrowser() {
  if (browser) return;
  browser = await puppeteer.launch({
    headless: CONFIG.headless,
    userDataDir: CONFIG.userDataDir,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15");
}

async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; page = null; }
}

async function navigateToCanva() {
  await initBrowser();
  await page.goto("https://www.canva.com/", { waitUntil: "networkidle2", timeout: 60000 });
  return await page.url();
}

async function isLoggedIn() {
  await initBrowser();
  const cookies = await page.cookies();
  return !!cookies.find(c => c.name === "CAZ");
}

async function browserFetch(urlPath, options = {}) {
  await initBrowser();
  return await page.evaluate(async (path, opts) => {
    try {
      const r = await fetch("https://www.canva.com" + path, {
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: "include"
      });
      return { status: r.status, statusText: r.statusText, body: await r.text() };
    } catch (e) { return { error: e.message }; }
  }, urlPath, options);
}

async function getCookies() {
  await initBrowser();
  return await page.cookies();
}

const server = new Server({ name: "canva-puppeteer", version: "5.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "canva_init", description: "Initialise le navigateur et va sur Canva", inputSchema: { type: "object", properties: { headless: { type: "boolean" } } } },
    { name: "canva_login", description: "Ouvre Canva en mode visible pour login manuel", inputSchema: { type: "object", properties: {} } },
    { name: "canva_status", description: "Verifie si connecte a Canva", inputSchema: { type: "object", properties: {} } },
    { name: "canva_fetch", description: "Requete HTTP via navigateur", inputSchema: { type: "object", properties: { path: { type: "string" }, method: { type: "string" }, body: { type: "object" } }, required: ["path"] } },
    { name: "canva_list_designs", description: "Liste les designs", inputSchema: { type: "object", properties: {} } },
    { name: "canva_screenshot", description: "Capture ecran", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
    { name: "canva_goto", description: "Navigue vers URL", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
    { name: "canva_close", description: "Ferme navigateur", inputSchema: { type: "object", properties: {} } }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case "canva_init": {
        CONFIG.headless = args.headless !== false;
        await closeBrowser();
        const url = await navigateToCanva();
        const logged = await isLoggedIn();
        return { content: [{ type: "text", text: "Navigateur init (headless: " + CONFIG.headless + ")\nURL: " + url + "\nConnecte: " + (logged ? "OUI" : "NON - utilise canva_login") }] };
      }
      case "canva_login": {
        CONFIG.headless = false;
        await closeBrowser();
        await initBrowser();
        await page.goto("https://www.canva.com/login", { waitUntil: "networkidle2", timeout: 60000 });
        return { content: [{ type: "text", text: "Fenetre ouverte. Connecte-toi manuellement puis canva_status." }] };
      }
      case "canva_status": {
        const logged = await isLoggedIn();
        const cookies = await getCookies();
        const c = cookies.filter(c => ["CAZ", "CAN", "cf_clearance"].includes(c.name));
        return { content: [{ type: "text", text: "Connecte: " + (logged ? "OUI" : "NON") + "\n\nCookies:\n" + c.map(x => "- " + x.name + ": " + x.value.substring(0,30) + "...").join("\n") }] };
      }
      case "canva_fetch": {
        const r = await browserFetch(args.path, { method: args.method || "GET", body: args.body });
        if (r.error) return { content: [{ type: "text", text: "Erreur: " + r.error }] };
        const body = r.body.length > 3000 ? r.body.substring(0, 3000) + "..." : r.body;
        return { content: [{ type: "text", text: "Status: " + r.status + " " + r.statusText + "\n\n" + body }] };
      }
      case "canva_list_designs": {
        const r = await browserFetch("/_ajax/folders?ownerId=all&ownerType=all&sortBy=relevance&docType=all");
        if (r.error) return { content: [{ type: "text", text: "Erreur: " + r.error }] };
        return { content: [{ type: "text", text: "Status: " + r.status + "\n\n" + r.body.substring(0, 2000) }] };
      }
      case "canva_screenshot": {
        await initBrowser();
        const p = args.path || path.join(__dirname, "screenshot.png");
        await page.screenshot({ path: p });
        return { content: [{ type: "text", text: "Screenshot: " + p }] };
      }
      case "canva_goto": {
        await initBrowser();
        await page.goto(args.url, { waitUntil: "networkidle2", timeout: 60000 });
        return { content: [{ type: "text", text: "Navigue: " + (await page.url()) }] };
      }
      case "canva_close": {
        await closeBrowser();
        return { content: [{ type: "text", text: "Navigateur ferme." }] };
      }
      default: throw new Error("Outil inconnu: " + name);
    }
  } catch (e) { return { content: [{ type: "text", text: "Erreur: " + e.message }] }; }
});

process.on("SIGINT", async () => { await closeBrowser(); process.exit(0); });
process.on("SIGTERM", async () => { await closeBrowser(); process.exit(0); });

async function main() { await server.connect(new StdioServerTransport()); console.error("MCP Canva v5.0 - Puppeteer Stealth"); }
main().catch(console.error);
