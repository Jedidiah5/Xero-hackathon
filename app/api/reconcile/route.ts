import { NextResponse } from "next/server";
import { xero } from "@/lib/xero";
import { MockXeroProvider } from "@/lib/xero/mock";
import { mockStripePayments } from "@/lib/stripe/mock";
import { reconcileAll } from "@/lib/agent/reconcile";

// Runs the agent over the six demo payments server-side.
// Each run is a fresh replay: the mock world resets to its seeded state first
// (idempotency *within* a run — the duplicate store — arrives in Stage 3).
export async function POST() {
  if (xero instanceof MockXeroProvider) xero.reset();

  const results = await reconcileAll(mockStripePayments, xero);
  const invoices = await xero.getInvoices();
  const bankTransactions = xero instanceof MockXeroProvider ? xero.getBankTransactions() : [];

  return NextResponse.json({ results, invoices, bankTransactions });
}
