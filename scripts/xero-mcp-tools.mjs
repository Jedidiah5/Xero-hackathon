// Discovery: list the Xero MCP server's tools (names + input schemas).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const creds = JSON.parse(readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf8"));
const key = Object.keys(creds.mcpOAuth).find((k) => k.startsWith("xero-mcp"));
const token = creds.mcpOAuth[key].accessToken;

const transport = new StreamableHTTPClientTransport(new URL("https://builders.xero.com/beta/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "ledger-discovery", version: "0.1.0" });
await client.connect(transport);
const { tools } = await client.listTools();
for (const t of tools) {
  console.log(`\n=== ${t.name}`);
  console.log((t.description ?? "").slice(0, 200));
  console.log("input:", JSON.stringify(t.inputSchema?.properties ?? {}, null, 1).slice(0, 800));
}
await client.close();
