import type { Invoice } from "../xero/types";
import type { StripeCharge } from "../stripe/types";

// Matching runs entirely against the local invoice cache — never against the
// provider directly (rate-limit-aware pattern, CLAUDE.md section 4).

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export const penceToPounds = (pence: number) => Math.round(pence) / 100;

export interface MatchHit {
  invoice: Invoice;
  referenceHit: boolean;
  amountHit: boolean;
  customerHit: boolean;
}

/**
 * Exact match: the payment's invoice reference, gross amount, and customer name
 * all agree with exactly ONE open invoice. Anything weaker (fuzzy name, amount
 * mismatch, missing reference) is not a MATCH and falls to later-stage handling.
 */
export function findExactMatch(payment: StripeCharge, openInvoices: Invoice[]): MatchHit | null {
  const ref = payment.metadata.invoice_number;
  const name = payment.billing_details.name;
  const gross = penceToPounds(payment.amount);

  const hits = openInvoices.filter((inv) => {
    const referenceHit = !!ref && norm(inv.InvoiceNumber) === norm(ref);
    const customerHit = !!name && norm(inv.Contact.Name) === norm(name);
    const amountHit = inv.Total === gross && inv.AmountDue === gross;
    return referenceHit && customerHit && amountHit;
  });

  if (hits.length !== 1) return null;
  return { invoice: hits[0], referenceHit: true, amountHit: true, customerHit: true };
}
