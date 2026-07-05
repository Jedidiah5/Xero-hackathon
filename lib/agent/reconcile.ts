import type { XeroProvider } from "../xero/provider";
import type { BankTransaction } from "../xero/types";
import type { StripeCharge } from "../stripe/types";
import type { Decision } from "./decision";
import { IdempotencyStore } from "./idempotency";
import { findExactMatch, findPartialMatch, penceToPounds } from "./match";

export interface ReconcileResult {
  payment: StripeCharge;
  decision: Decision;
  /** The spend-money write this decision produced (FEE_SPLIT only) — evidence for the UI. */
  bankTransaction?: BankTransaction;
}

const gbp = (pounds: number) =>
  pounds.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

/**
 * Runs the agent over a batch of Stripe payments.
 * Xero state is pulled ONCE into a local cache up front; all matching runs
 * against the cache and only the resulting writes go back to the provider
 * (60 calls/min budget — never a per-payment read loop).
 *
 * Decision order per payment (CLAUDE.md section 6):
 *   1. Seen charge id?            → DUPLICATE (skip before any matching/writes)
 *   2. Exact single match, no fee → MATCH      (mark paid)
 *   3. Exact single match, fee    → FEE_SPLIT  (mark paid gross + book fee)
 *   4. Right invoice, short paid  → PARTIAL    (flag — never auto-post)
 *   5. Nothing confident          → NO_MATCH   (flag to review queue)
 */
export async function reconcileAll(
  payments: StripeCharge[],
  xero: XeroProvider
): Promise<ReconcileResult[]> {
  const [invoices, contacts] = await Promise.all([xero.getInvoices(), xero.getContacts()]);
  void contacts; // cached alongside; fuzzy customer matching would use these

  // Local working copy of open invoices. Writes update this cache in place, so a
  // later payment can't match an invoice already settled in this run (no re-fetch).
  const openInvoices = invoices.filter((inv) => inv.Status === "AUTHORISED");

  // One store per world: a fresh demo run resets both together. Durable in production.
  const processed = new IdempotencyStore();

  const results: ReconcileResult[] = [];

  for (const payment of payments) {
    const gross = penceToPounds(payment.amount);
    const fee = penceToPounds(payment.balance_transaction.fee);
    const net = penceToPounds(payment.balance_transaction.net);

    // 1. Idempotency gate — BEFORE any matching or writing. A redelivered
    // webhook is recognised by charge id alone; nothing downstream runs.
    if (processed.has(payment.id)) {
      results.push({
        payment,
        decision: {
          type: "DUPLICATE",
          payment,
          confidence: 1,
          reason: `Duplicate webhook — charge ${payment.id} already processed · skipped, no double-booking.`,
        },
      });
      continue;
    }
    processed.record(payment.id);

    // 2–3. Exact single hit on reference + amount + customer against the cache.
    const exact = findExactMatch(payment, openInvoices);

    if (exact) {
      // The invoice is settled for the GROSS amount — the customer paid it in
      // full; Stripe's cut is the business's cost, not the customer's shortfall.
      await xero.markPaid(exact.invoice.InvoiceID, gross, payment.id);
      openInvoices.splice(openInvoices.indexOf(exact.invoice), 1);

      if (fee > 0) {
        const bankTransaction = await xero.createFeeExpense(exact.invoice.Contact.Name, fee, payment.id);
        results.push({
          payment,
          bankTransaction,
          decision: {
            type: "FEE_SPLIT",
            payment,
            invoice: exact.invoice,
            feeAmount: fee,
            confidence: 0.97,
            reason: `${exact.invoice.InvoiceNumber} paid in full (${gbp(gross)}) · ${gbp(fee)} Stripe fee booked to expense — net ${gbp(net)} reconciles against the deposit.`,
          },
        });
      } else {
        results.push({
          payment,
          decision: {
            type: "MATCH",
            payment,
            invoice: exact.invoice,
            confidence: 0.98,
            reason: `Reference ${exact.invoice.InvoiceNumber}, amount ${gbp(gross)} and customer ${exact.invoice.Contact.Name} all agree — marked paid.`,
          },
        });
      }
      continue;
    }

    // 4. Right invoice, wrong amount: confidently identified but short of the
    // amount due. Flagged — the agent never guesses a payment into "settled".
    const partial = findPartialMatch(payment, openInvoices);
    if (partial) {
      results.push({
        payment,
        decision: {
          type: "PARTIAL",
          payment,
          invoice: partial.invoice,
          confidence: 0.6,
          reason: `Partial payment — ${gbp(gross)} of ${gbp(partial.invoice.Total)} on ${partial.invoice.InvoiceNumber} · needs review before posting.`,
        },
      });
      continue;
    }

    // 5. Nothing confident — the human "Find & Match" step, automated into a queue.
    const missing = !payment.metadata.invoice_number
      ? "no reference on payment"
      : "no open invoice agrees on amount and customer";
    results.push({
      payment,
      decision: {
        type: "NO_MATCH",
        payment,
        confidence: 0.2,
        reason: `No matching invoice — ${missing} · routed for manual review.`,
      },
    });
  }

  return results;
}
