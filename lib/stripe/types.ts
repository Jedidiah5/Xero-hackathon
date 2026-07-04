// Stripe-shaped types (subset of the Charge object we need).
// Amounts are integers in the smallest currency unit (pence), per Stripe.
// https://stripe.com/docs/api/charges/object

export interface StripeBalanceTransaction {
  id: string; // txn_...
  amount: number; // gross, in pence
  fee: number; // Stripe processing fee, in pence
  net: number; // amount - fee, in pence
  currency: string;
}

export interface StripeBillingDetails {
  name: string | null;
  email: string | null;
}

export interface StripeCharge {
  id: string; // ch_... — the idempotency key for duplicate detection
  object: "charge";
  amount: number; // in pence
  currency: string; // "gbp"
  created: number; // unix timestamp
  status: "succeeded" | "pending" | "failed";
  description: string | null;
  billing_details: StripeBillingDetails;
  /** Invoice reference, when the payer's checkout carried one. */
  metadata: { invoice_number?: string };
  balance_transaction: StripeBalanceTransaction;
}
