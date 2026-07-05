import type { Invoice } from "../xero/types";
import type { StripeCharge } from "./types";

// Live-mode scenario: the same six-payment narrative arc as the mock demo
// (clean match ×2, fee split, partial, unknown sender, duplicate webhook),
// derived from the connected org's REAL open invoices. The Stripe side is
// simulated either way — the Xero side is genuinely written to.
//
// Deterministic: eligible invoices are sorted by InvoiceNumber and the first
// four become the targets, so page load and run agree on the same scenario.

const charge = (
  id: string,
  amountPence: number,
  feePence: number,
  name: string | null,
  invoiceNumber: string | undefined,
  description: string | null
): StripeCharge => ({
  id,
  object: "charge",
  amount: amountPence,
  currency: "gbp",
  created: Math.floor(Date.now() / 1000),
  status: "succeeded",
  description,
  billing_details: { name, email: null },
  metadata: invoiceNumber ? { invoice_number: invoiceNumber } : {},
  balance_transaction: {
    id: `txn_${id.slice(3)}`,
    amount: amountPence,
    fee: feePence,
    net: amountPence - feePence,
    currency: "gbp",
  },
});

export function buildLiveScenario(invoices: Invoice[]): StripeCharge[] {
  // Exact-matchable = open, sales, nothing credited (Total still equals due).
  const eligible = invoices
    .filter(
      (inv) =>
        inv.Type === "ACCREC" &&
        inv.Status === "AUTHORISED" &&
        inv.AmountDue > 0 &&
        inv.Total === inv.AmountDue &&
        inv.InvoiceNumber &&
        inv.Contact?.Name
    )
    .sort((a, b) => a.InvoiceNumber.localeCompare(b.InvoiceNumber));

  if (eligible.length < 4) {
    throw new Error(
      `Live scenario needs 4 open, uncredited sales invoices in the org; found ${eligible.length}. ` +
        "Previous live runs may have settled them — reset the Xero Demo Company or switch XERO_MODE back to mock."
    );
  }

  const [t1, t2, t3, t4] = eligible;
  const pence = (pounds: number) => Math.round(pounds * 100);
  const id = (inv: Invoice) => `ch_live_${inv.InvoiceID.replace(/-/g, "").slice(0, 12)}`;

  const grossT2 = pence(t2.Total);
  const stripeFee = Math.round(grossT2 * 0.029) + 20; // 2.9% + 20p
  const partialAmount = Math.max(1, Math.round(pence(t4.Total) * 0.55));

  return [
    // 1 — clean match
    charge(id(t1), pence(t1.Total), 0, t1.Contact.Name, t1.InvoiceNumber, `Payment for ${t1.InvoiceNumber}`),
    // 2 — fee split
    charge(id(t2), grossT2, stripeFee, t2.Contact.Name, t2.InvoiceNumber, `Payment for ${t2.InvoiceNumber}`),
    // 3 — clean match
    charge(id(t3), pence(t3.Total), 0, t3.Contact.Name, t3.InvoiceNumber, `Payment for ${t3.InvoiceNumber}`),
    // 4 — partial payment → flagged, never posted
    charge(id(t4), partialAmount, 0, t4.Contact.Name, t4.InvoiceNumber, "Part payment"),
    // 5 — unknown sender, no reference → flagged
    charge("ch_live_unknown00", 9000, 0, null, undefined, null),
    // 6 — duplicate webhook of #1: identical charge id → skipped, no write
    charge(id(t1), pence(t1.Total), 0, t1.Contact.Name, t1.InvoiceNumber, `Payment for ${t1.InvoiceNumber}`),
  ];
}
