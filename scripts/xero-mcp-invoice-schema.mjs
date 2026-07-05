// Print the FULL input schema for create_invoice (+ create_bank_transaction)
// so the seed script uses real parameters, not guesses.
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
const client = new Client({ name: "ledger-schema", version: "0.1.0" });
await client.connect(transport);
const { tools } = await client.listTools();
for (const name of ["create_invoice", "create_bank_transaction", "create_payment"]) {
  const t = tools.find((t) => t.name === name);
  console.log(`\n===== ${name}`);
  console.log(JSON.stringify(t.inputSchema, null, 1));
}
await client.close();
