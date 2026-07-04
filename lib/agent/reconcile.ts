import type { XeroProvider } from "../xero/provider";
import type { StripeCharge } from "../stripe/types";
import type { Decision } from "./decision";
import { findExactMatch, penceToPounds } from "./match";

export interface ReconcileResult {
  payment: StripeCharge;
  /** null = the agent doesn't handle this case yet → stays "Pending" in the UI.
   *  Stage 3 replaces null with PARTIAL / NO_MATCH / DUPLICATE. */
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
    const net = penceToPounds(payment.balance_transaction.net);

    // Exact single hit on reference + amount + customer against the cache.
    // PARTIAL / NO_MATCH / DUPLICATE handling lands in Stage 3.
    const hit = findExactMatch(payment, openInvoices);

    if (!hit) {
      results.push({ payment, decision: null });
      continue;
    }

    // The invoice is settled for the GROSS amount — the customer paid it in
    // full; Stripe's cut is the business's cost, not the customer's shortfall.
    await xero.markPaid(hit.invoice.InvoiceID, gross, payment.id);
    openInvoices.splice(openInvoices.indexOf(hit.invoice), 1);

    if (fee > 0) {
      // FEE_SPLIT: gross settles the invoice, the fee books as spend money,
      // and the net deposit is what actually lands in the bank feed.
      await xero.createFeeExpense(hit.invoice.Contact.Name, fee, payment.id);
      results.push({
        payment,
        decision: {
          type: "FEE_SPLIT",
          payment,
          invoice: hit.invoice,
          feeAmount: fee,
          confidence: 0.97,
          reason: `${hit.invoice.InvoiceNumber} paid in full (${gbp(gross)}) · ${gbp(fee)} Stripe fee booked to expense — net ${gbp(net)} reconciles against the deposit.`,
        },
      });
    } else {
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
    }
  }

  return results;
}
