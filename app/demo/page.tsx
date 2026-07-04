import { xero } from "@/lib/xero";
import { MockXeroProvider } from "@/lib/xero/mock";
import { mockStripePayments } from "@/lib/stripe/mock";
import Dashboard from "../dashboard";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  // Fresh seeded world on every page load, so the dashboard's initial state
  // always shows the six open invoices regardless of earlier runs.
  if (xero instanceof MockXeroProvider) xero.reset();
  const invoices = await xero.getInvoices();

  return <Dashboard initialPayments={mockStripePayments} initialInvoices={invoices} />;
}
