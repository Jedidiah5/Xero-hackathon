import type { XeroProvider } from "../xero/provider";
import type { StripeCharge } from "../stripe/types";
import type { Decision } from "./decision";
import { findExactMatch, penceToPounds } from "./match";

export interface ReconcileResult {
  payment: StripeCharge;
  /** null = the agent doesn't handle this case yet → stays "Pending" in the UI.
   *  Stages 2–3 replace null with FEE_SPLIT / PARTIAL / NO_MATCH / DUPLICATE. */
  decision: Decision | null;
}

const gbp = (pounds: number) =>
  pounds.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

/**
 * Runs the agent over a batch of Stripe payments.
 * Xero state is pulled ONCE into a local cache up front; all matching runs
 * against the cache and only the resulting writes go back to the provider
 * (60 calls/min budget — never a per-payment read loop).
 */
export async function reconcileAll(
  payments: StripeCharge[],
  xero: XeroProvider
): Promise<ReconcileResult[]> {
  const [invoices, contacts] = await Promise.all([xero.getInvoices(), xero.getContacts()]);
  void contacts; // cached alongside; fuzzy customer matching uses these in later stages

  // Local working copy of open invoices. Writes update this cache in place, so a
  // later payment can't match an invoice already settled in this run (no re-fetch).
  const openInvoices = invoices.filter((inv) => inv.Status === "AUTHORISED");

  const results: ReconcileResult[] = [];

  for (const payment of payments) {
    const gross = penceToPounds(payment.amount);
    const fee = penceToPounds(payment.balance_transaction.fee);

    // Stage 1: only the clean MATCH path — no fee, exact single hit on
    // reference + amount + customer. Everything else stays pending for now.
    const hit = fee === 0 ? findExactMatch(payment, openInvoices) : null;

    if (hit) {
      await xero.markPaid(hit.invoice.InvoiceID, gross, payment.id);
      openInvoices.splice(openInvoices.indexOf(hit.invoice), 1);

      results.push({
        payment,
        decision: {
          type: "MATCH",
          payment,
          invoice: hit.invoice,
          confidence: 0.98,
          reason: `Reference ${hit.invoice.InvoiceNumber}, amount ${gbp(gross)} and customer ${hit.invoice.Contact.Name} all agree — marked paid.`,
        },
      });
    } else {
      results.push({ payment, decision: null });
    }
  }

  return results;
}
