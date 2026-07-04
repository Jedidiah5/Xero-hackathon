import type { Invoice } from "../xero/types";
import type { StripeCharge } from "../stripe/types";

// The five outcomes the agent can decide. Stage 1 produces only MATCH;
// FEE_SPLIT lands in Stage 2, PARTIAL / NO_MATCH / DUPLICATE in Stage 3.
export type DecisionType = "MATCH" | "FEE_SPLIT" | "PARTIAL" | "NO_MATCH" | "DUPLICATE";

export interface Decision {
  type: DecisionType;
  payment: StripeCharge;
  /** The open invoice this payment settles (absent for NO_MATCH / DUPLICATE). */
  invoice?: Invoice;
  /** Stripe processing fee in pounds, when split out (FEE_SPLIT). */
  feeAmount?: number;
  confidence: number; // 0..1
  /** Crisp, human-readable — shown in the UI rows and the review queue. */
  reason: string;
}
