import { NextResponse } from "next/server";
import { LiveXeroProvider } from "@/lib/xero/live";
import { xeroMode } from "@/lib/xero";

// Live-connection smoke test, independent of XERO_MODE: proves the MCP
// connection + read path against the Demo org WITHOUT flipping the app off
// the mock. GET /api/xero-health — read-only, never writes.
export async function GET() {
  const live = new LiveXeroProvider();
  try {
    const invoices = await live.getInvoices();
    const contacts = await live.getContacts();
    const accounts = await live.getAccounts();
    return NextResponse.json({
      ok: true,
      appMode: xeroMode,
      organisation: live.tenantName,
      openSalesInvoices: invoices.length,
      sample: invoices.slice(0, 3).map((i) => ({
        number: i.InvoiceNumber,
        contact: i.Contact.Name,
        due: i.AmountDue,
      })),
      contacts: contacts.length,
      accounts: accounts.length,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, appMode: xeroMode, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
