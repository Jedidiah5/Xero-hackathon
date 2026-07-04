// Shape probe: call the read tools once and print raw result structure,
// so lib/xero/live.ts maps real shapes instead of guessed ones.
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
const client = new Client({ name: "ledger-probe", version: "0.1.0" });
await client.connect(transport);

const show = (name, res) => {
  console.log(`\n===== ${name}`);
  if (res.structuredContent) {
    console.log("STRUCTURED:", JSON.stringify(res.structuredContent).slice(0, 1500));
  }
  for (const c of res.content ?? []) {
    console.log(`content[${c.type}]:`, (c.text ?? "").slice(0, 1500));
  }
};

const tenants = await client.callTool({ name: "get_connected_tenants", arguments: {} });
show("get_connected_tenants", tenants);

// Pull tenant id out of whatever shape came back
const text = tenants.content?.find((c) => c.type === "text")?.text ?? "{}";
const parsed = JSON.parse(text);
console.log("\nparsed tenants:", JSON.stringify(parsed).slice(0, 600));
const arr = Array.isArray(parsed) ? parsed : parsed.tenants ?? parsed.connections ?? [];
const tenantId = arr[0]?.tenantId ?? arr[0]?.TenantId ?? arr[0]?.id;
console.log("tenantId =", tenantId);

show("list_invoices", await client.callTool({
  name: "list_invoices",
  arguments: { xeroTenantId: tenantId, statuses: "AUTHORISED", pageSize: 2 },
}));
show("list_contacts", await client.callTool({
  name: "list_contacts",
  arguments: { xeroTenantId: tenantId, pageSize: 2 },
}));
show("list_accounts", await client.callTool({
  name: "list_accounts",
  arguments: { xeroTenantId: tenantId },
}));

await client.close();
