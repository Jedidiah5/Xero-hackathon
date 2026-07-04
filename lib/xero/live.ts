// LiveXeroProvider — talks to the Xero MCP server (builders.xero.com/beta/mcp).
// Server-side only. Implements the same XeroProvider seam as the mock; nothing
// in /agent or /app changes when XERO_MODE flips.
//
// Auth: reuses the OAuth token the Claude Code CLI stored when the user
// authenticated xero-mcp (~/.claude/.credentials.json). The token is re-read
// on every connect, so a CLI-side refresh is picked up automatically. If it
// has expired, run `claude mcp list` inside Xero-hackathon (or re-auth via
// /mcp) and retry.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { XeroProvider } from "./provider";
import type { Account, BankTransaction, Contact, Invoice, LineItem, Payment } from "./types";

const MCP_URL = "https://builders.xero.com/beta/mcp";
const FEE_CONTACT_NAME = "Stripe Payments UK Ltd";

/* ------------------------------------------------------------------ */
/* Token + connection                                                  */

function readStoredToken(): string {
  const path = join(homedir(), ".claude", ".credentials.json");
  let creds: { mcpOAuth?: Record<string, { accessToken: string; expiresAt: number }> };
  try {
    creds = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Xero live mode: cannot read ${path}. Authenticate xero-mcp first (claude → /mcp).`);
  }
  const key = Object.keys(creds.mcpOAuth ?? {}).find((k) => k.startsWith("xero-mcp"));
  const entry = key ? creds.mcpOAuth![key] : undefined;
  if (!entry?.accessToken) {
    throw new Error("Xero live mode: no xero-mcp OAuth token found. Authenticate via claude → /mcp first.");
  }
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    throw new Error(
      "Xero live mode: the stored xero-mcp token has expired. Run `claude mcp list` in Xero-hackathon to refresh it, then retry."
    );
  }
  return entry.accessToken;
}

/* ------------------------------------------------------------------ */
/* Result parsing — tools return { data: { _Invoices: [...] } } etc.   */

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

function parseTool<T = Record<string, unknown>>(res: ToolResult, what: string): T {
  const text = (res.content as Array<{ type: string; text?: string }> | undefined)?.find(
    (c) => c.type === "text"
  )?.text;
  if (res.isError) {
    throw new Error(`Xero MCP ${what} failed: ${text?.slice(0, 400) ?? "unknown error"}`);
  }
  if (!text) throw new Error(`Xero MCP ${what}: empty response`);
  let parsed: { data?: T } & T;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Xero MCP ${what}: non-JSON response: ${text.slice(0, 200)}`);
  }
  return (parsed.data ?? parsed) as T;
}

/* ------------------------------------------------------------------ */
/* camelCase (MCP) → PascalCase (our types, mirroring Xero's REST API) */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapContact = (c: any): Contact => ({
  ContactID: c.contactID,
  Name: c.name,
  EmailAddress: c.emailAddress,
});

const mapLineItem = (li: any): LineItem => ({
  Description: li.description ?? "",
  Quantity: li.quantity ?? 1,
  UnitAmount: li.unitAmount ?? 0,
  AccountCode: li.accountCode,
  LineAmount: li.lineAmount ?? 0,
});

const mapInvoice = (inv: any): Invoice => ({
  InvoiceID: inv.invoiceID,
  InvoiceNumber: inv.invoiceNumber ?? "",
  Type: inv.type,
  Contact: mapContact(inv.contact ?? {}),
  Status: inv.status,
  LineItems: (inv.lineItems ?? []).map(mapLineItem),
  SubTotal: inv.subTotal ?? 0,
  TotalTax: inv.totalTax ?? 0,
  Total: inv.total ?? 0,
  AmountDue: inv.amountDue ?? 0,
  AmountPaid: inv.amountPaid ?? 0,
  CurrencyCode: inv.currencyCode ?? "GBP",
  Date: inv.date ?? "",
  DueDate: inv.dueDate ?? "",
  Reference: inv.reference || undefined,
});

const mapAccount = (a: any): Account => ({
  AccountID: a.accountID,
  Code: a.code,
  Name: a.name,
  Type: a.type,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */

export class LiveXeroProvider implements XeroProvider {
  private client: Client | null = null;
  private tenantId = "";
  tenantName = "";

  // Cached lookups so writes don't re-read the org (rate-limit discipline).
  private accountsCache: Account[] | null = null;
  private feeContactId: string | null = null;

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const token = readStoredToken();
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: "ledger", version: "0.1.0" });
    await client.connect(transport);

    const res = await client.callTool({ name: "get_connected_tenants", arguments: {} });
    const tenants = parseTool<Array<{ tenantId: string; tenantName: string }>>(
      res,
      "get_connected_tenants"
    );
    const first = Array.isArray(tenants) ? tenants[0] : undefined;
    if (!first?.tenantId) throw new Error("Xero live mode: no connected organisation found.");
    this.tenantId = first.tenantId;
    this.tenantName = first.tenantName ?? "";
    this.client = client;
    return client;
  }

  /** callTool with tenant injected + one retry on rate-limit (429). */
  private async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const client = await this.connect();
    const doCall = () => client.callTool({ name, arguments: { xeroTenantId: this.tenantId, ...args } });
    let res = await doCall();
    const text = (res.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? "";
    if (res.isError && /429|rate ?limit/i.test(text)) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await doCall();
    }
    return res;
  }

  /** Open sales invoices (ACCREC + AUTHORISED), all pages. */
  async getInvoices(): Promise<Invoice[]> {
    const out: Invoice[] = [];
    let page = 1;
    for (;;) {
      const data = parseTool<{
        pagination?: { page: number; pageCount: number };
        _Invoices?: unknown[];
      }>(await this.call("list_invoices", { statuses: "AUTHORISED", page, pageSize: 100 }), "list_invoices");
      out.push(...(data._Invoices ?? []).map(mapInvoice));
      const pg = data.pagination;
      if (!pg || pg.page >= pg.pageCount) break;
      page = pg.page + 1;
      if (page > 10) break; // hard stop — the demo org is small; never loop the API
    }
    return out.filter((inv) => inv.Type === "ACCREC");
  }

  async getContacts(): Promise<Contact[]> {
    const out: Contact[] = [];
    let page = 1;
    for (;;) {
      const data = parseTool<{
        pagination?: { page: number; pageCount: number };
        _Contacts?: unknown[];
      }>(await this.call("list_contacts", { page, pageSize: 100 }), "list_contacts");
      out.push(...(data._Contacts ?? []).map(mapContact));
      const pg = data.pagination;
      if (!pg || pg.page >= pg.pageCount) break;
      page = pg.page + 1;
      if (page > 10) break;
    }
    return out;
  }

  async getAccounts(): Promise<Account[]> {
    if (this.accountsCache) return this.accountsCache;
    const data = parseTool<{ _Accounts?: unknown[] }>(
      await this.call("list_accounts", {}),
      "list_accounts"
    );
    this.accountsCache = (data._Accounts ?? []).map(mapAccount);
    return this.accountsCache;
  }

  private async bankAccount(): Promise<Account> {
    const accounts = await this.getAccounts();
    const bank =
      accounts.find((a) => a.Type === "BANK" && /business bank/i.test(a.Name)) ??
      accounts.find((a) => a.Type === "BANK");
    if (!bank) throw new Error("Xero live mode: no BANK account in the chart of accounts.");
    return bank;
  }

  private async feeExpenseAccount(): Promise<Account> {
    const accounts = await this.getAccounts();
    const acc =
      accounts.find((a) => a.Type === "EXPENSE" && /bank fees/i.test(a.Name)) ??
      accounts.find((a) => a.Code === "404") ??
      accounts.find((a) => a.Type === "EXPENSE");
    if (!acc) throw new Error("Xero live mode: no EXPENSE account found for fees.");
    return acc;
  }

  async markPaid(invoiceId: string, amount: number, reference?: string): Promise<Payment> {
    const bank = await this.bankAccount();
    const res = await this.call("create_payment", {
      invoiceId,
      accountId: bank.AccountID,
      amount,
      reference: reference ?? null,
    });
    const raw = JSON.stringify(parseTool(res, "create_payment"));
    const paymentId = /"paymentID"\s*:\s*"([^"]+)"/i.exec(raw)?.[1] ?? `live-${Date.now()}`;
    return {
      PaymentID: paymentId,
      Invoice: { InvoiceID: invoiceId, InvoiceNumber: "" },
      Account: { AccountID: bank.AccountID, Code: bank.Code },
      Date: new Date().toISOString().slice(0, 10),
      Amount: amount,
      Reference: reference,
      Status: "AUTHORISED",
    };
  }

  async createFeeExpense(contactName: string, amount: number, reference?: string): Promise<BankTransaction> {
    // The fee is payable to Stripe, not the customer — find or create that contact once.
    if (!this.feeContactId) {
      const data = parseTool<{ _Contacts?: Array<{ contactID: string; name: string }> }>(
        await this.call("list_contacts", { searchTerm: "Stripe", pageSize: 10 }),
        "list_contacts(Stripe)"
      );
      this.feeContactId = data._Contacts?.[0]?.contactID ?? null;
      if (!this.feeContactId) {
        const created = parseTool<Record<string, unknown>>(
          await this.call("create_contact", { name: FEE_CONTACT_NAME }),
          "create_contact"
        );
        this.feeContactId =
          /"contactID"\s*:\s*"([^"]+)"/i.exec(JSON.stringify(created))?.[1] ?? null;
      }
      if (!this.feeContactId) throw new Error("Xero live mode: could not resolve a Stripe contact.");
    }

    const expense = await this.feeExpenseAccount();
    const bank = await this.bankAccount();
    const description = `Stripe processing fee — ${contactName}${reference ? ` · ${reference}` : ""}`;
    const res = await this.call("create_bank_transaction", {
      type: "SPEND",
      contactId: this.feeContactId,
      lineItems: [{ description, quantity: 1, unitAmount: amount, accountCode: expense.Code }],
    });
    const raw = JSON.stringify(parseTool(res, "create_bank_transaction"));
    const btId = /"bankTransactionID"\s*:\s*"([^"]+)"/i.exec(raw)?.[1] ?? `live-bt-${Date.now()}`;
    return {
      BankTransactionID: btId,
      Type: "SPEND",
      Contact: { ContactID: this.feeContactId, Name: FEE_CONTACT_NAME },
      LineItems: [
        { Description: description, Quantity: 1, UnitAmount: amount, AccountCode: expense.Code, LineAmount: amount },
      ],
      BankAccount: { AccountID: bank.AccountID, Code: bank.Code, Name: bank.Name },
      Date: new Date().toISOString().slice(0, 10),
      Status: "AUTHORISED",
      Total: amount,
      Reference: reference,
    };
  }
}
