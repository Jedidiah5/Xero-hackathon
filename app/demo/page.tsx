import Link from "next/link";
import { xero, xeroMode } from "@/lib/xero";
import { MockXeroProvider } from "@/lib/xero/mock";
import { LiveXeroProvider } from "@/lib/xero/live";
import { mockStripePayments } from "@/lib/stripe/mock";
import { buildLiveScenario } from "@/lib/stripe/scenario";
import Dashboard from "../dashboard";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  // Mock: fresh seeded world on every page load, so the demo always starts
  // from six open invoices. Live: the org is what it is — no reset.
  if (xero instanceof MockXeroProvider) xero.reset();

  try {
    const invoices = await xero.getInvoices();
    const payments =
      xeroMode === "live" ? buildLiveScenario(invoices) : mockStripePayments;
    const orgName = xero instanceof LiveXeroProvider ? xero.tenantName : null;

    return (
      <Dashboard
        initialPayments={payments}
        initialInvoices={invoices}
        mode={xeroMode}
        orgName={orgName}
      />
    );
  } catch (err) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-sans text-2xl font-bold">Live mode isn&apos;t ready</h1>
        <p className="mt-3 font-mono text-sm leading-relaxed text-[var(--muted)]">
          {err instanceof Error ? err.message : String(err)}
        </p>
        <p className="mt-4 font-mono text-sm text-[var(--muted)]">
          Remove <code>XERO_MODE=live</code> from .env.local and restart to fall back to the
          mock demo — it is always available.
        </p>
        <Link href="/" className="mt-6 inline-block font-mono text-sm font-bold text-[#6c4df6] underline">
          ← back to landing
        </Link>
      </div>
    );
  }
}
