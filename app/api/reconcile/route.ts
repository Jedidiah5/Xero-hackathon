import { NextResponse } from "next/server";
import { xero } from "@/lib/xero";
import { MockXeroProvider } from "@/lib/xero/mock";
import { mockStripePayments } from "@/lib/stripe/mock";
import type { StripeCharge } from "@/lib/stripe/types";
import { reconcileAll } from "@/lib/agent/reconcile";

// Runs the agent over a batch of Stripe payments server-side.
// The client posts the exact charges shown in its payment list (built once at
// page load — mock script or live-derived), so rows and results can't drift.
// Mock mode replays reset the seeded world; live mode writes are real and
// permanent in the connected org, which is the point.
export async function POST(req: Request) {
  let payments: StripeCharge[] = mockStripePayments;
  try {
    const body = await req.json();
    if (Array.isArray(body?.payments) && body.payments.length > 0) {
      payments = body.payments;
    }
  } catch {
    // no body → default to the mock demo script
  }

  if (xero instanceof MockXeroProvider) xero.reset();

  const results = await reconcileAll(payments, xero);
  const bankTransactions = results.flatMap((r) => (r.bankTransaction ? [r.bankTransaction] : []));

  return NextResponse.json({ results, bankTransactions });
}
