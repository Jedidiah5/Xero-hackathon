"use client";

import { useMemo, useRef, useState } from "react";
import type { BankTransaction, Invoice } from "@/lib/xero/types";
import type { StripeCharge } from "@/lib/stripe/types";
import type { ReconcileResult } from "@/lib/agent/reconcile";
import ReconcileFlow from "./reconcile-flow";

const REVEAL_MS = 750; // stagger between row outcomes — legibility over speed

const gbp = (pence: number) =>
  (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const gbpPounds = (pounds: number) =>
  pounds.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

type QueueAction = "approved" | "reassigned";

export default function Dashboard({
  initialPayments,
  initialInvoices,
}: {
  initialPayments: StripeCharge[];
  initialInvoices: Invoice[];
}) {
  // results[i] = null until the agent's outcome for payment i is revealed.
  const [results, setResults] = useState<(ReconcileResult | null)[]>(() =>
    initialPayments.map(() => null)
  );
  const [bankTxns, setBankTxns] = useState<BankTransaction[]>([]);
  const [queueActions, setQueueActions] = useState<Record<number, QueueAction>>({});
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const timers = useRef<number[]>([]);

  const revealed = useMemo(
    () =>
      results
        .map((r, i) => (r === null ? null : { ...r, index: i }))
        .filter((r) => r !== null),
    [results]
  );
  const matchedCount = revealed.filter((r) => r.decision.type === "MATCH").length;
  const feeSplitCount = revealed.filter((r) => r.decision.type === "FEE_SPLIT").length;
  const flaggedItems = revealed.filter((r) =>
    ["PARTIAL", "NO_MATCH"].includes(r.decision.type)
  );
  const skippedItems = revealed.filter((r) => r.decision.type === "DUPLICATE");

  // An invoice is settled by both MATCH and FEE_SPLIT outcomes.
  const paidInvoiceIds = useMemo(
    () =>
      new Set(
        revealed
          .filter(
            (r) =>
              (r.decision.type === "MATCH" || r.decision.type === "FEE_SPLIT") &&
              r.decision.invoice
          )
          .map((r) => r.decision.invoice!.InvoiceID)
      ),
    [revealed]
  );

  // Fee expenses appear in sync with their payment's reveal: the mock stores
  // the Stripe charge id as the bank transaction's Reference.
  const revealedFeeSplitChargeIds = useMemo(
    () =>
      new Set(
        revealed.filter((r) => r.decision.type === "FEE_SPLIT").map((r) => r.payment.id)
      ),
    [revealed]
  );
  const visibleTxns = bankTxns.filter(
    (bt) => bt.Reference && revealedFeeSplitChargeIds.has(bt.Reference)
  );

  const run = async () => {
    if (running) return;
    setRunning(true);
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setResults(initialPayments.map(() => null));
    setBankTxns([]);
    setQueueActions({});

    try {
      const res = await fetch("/api/reconcile", { method: "POST" });
      if (!res.ok) throw new Error(`Reconcile failed: ${res.status}`);
      const data: { results: ReconcileResult[]; bankTransactions: BankTransaction[] } =
        await res.json();
      setBankTxns(data.bankTransactions);

      data.results.forEach((result, i) => {
        const t = window.setTimeout(() => {
          setResults((prev) => {
            const next = [...prev];
            next[i] = result;
            return next;
          });
          if (i === data.results.length - 1) {
            setRunning(false);
            setHasRun(true);
          }
        }, (i + 1) * REVEAL_MS);
        timers.current.push(t);
      });
    } catch (err) {
      console.error(err);
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen px-8 py-10 text-[#f5f0e6]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-sans text-4xl font-bold tracking-tight">
            Ledger<span className="text-[#c8ff00]">.</span>
          </h1>
          <p className="mt-1 font-mono text-sm opacity-60">
            AI reconciliation agent · Stripe → Xero · provider: mock
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="bg-[#c8ff00] px-8 py-3 font-mono text-sm font-bold uppercase tracking-widest text-[#0a0a0a] transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {running ? "Running…" : hasRun ? "Replay" : "Run agent"}
        </button>
      </div>

      {/* Three.js hero — additive layer driven by the same `results` the rows
          render, so the flow and the numbers can never disagree. Removable
          without touching Stage 3. */}
      <ReconcileFlow
        payments={initialPayments}
        invoices={initialInvoices}
        results={results}
      />

      {/* Stat row */}
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Incoming"
          value={initialPayments.length}
          color="#f5f0e6"
          sub={skippedItems.length > 0 ? `${skippedItems.length} duplicate skipped` : undefined}
        />
        <StatCard label="Reconciled" value={matchedCount + feeSplitCount} color="#1d9e75" />
        <StatCard label="Fees split" value={feeSplitCount} color="#eda100" />
        <StatCard label="Flagged" value={flaggedItems.length} color="#d85a30" />
      </div>

      {/* Payment list */}
      <section className="mt-12">
        <h2 className="font-sans text-xl font-bold">Incoming payments</h2>
        <div className="mt-4 border-t border-[#f5f0e6]/15">
          {initialPayments.map((p, i) => {
            const decision = results[i]?.decision ?? null;
            const isDuplicate = decision?.type === "DUPLICATE";
            return (
              <div
                key={`${p.id}-${i}`}
                className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-6 gap-y-1 border-b border-[#f5f0e6]/10 py-4 transition-opacity md:grid-cols-[2rem_14rem_8rem_8rem_1fr]"
                style={isDuplicate ? { opacity: 0.45 } : undefined}
              >
                <span className="font-mono text-sm opacity-40">{i + 1}</span>
                <span className="font-sans text-base font-medium">
                  {p.billing_details.name ?? "Unknown sender"}
                </span>
                <span className="font-mono text-base">{gbp(p.amount)}</span>
                <span className="hidden font-mono text-sm opacity-50 md:block">
                  {p.metadata.invoice_number ?? "no ref"}
                </span>
                <span className="col-span-3 md:col-span-1">
                  {decision === null ? (
                    <StatusChip label="Pending" color="#f5f0e6" dim />
                  ) : decision.type === "MATCH" ? (
                    <Outcome chip="Matched" color="#1d9e75" reason={decision.reason} />
                  ) : decision.type === "FEE_SPLIT" ? (
                    <Outcome chip="Fee split" color="#eda100" reason={decision.reason} />
                  ) : decision.type === "PARTIAL" ? (
                    <Outcome chip="Partial" color="#d85a30" reason={decision.reason} />
                  ) : decision.type === "NO_MATCH" ? (
                    <Outcome chip="No match" color="#d85a30" reason={decision.reason} />
                  ) : (
                    <Outcome chip="Skipped · duplicate" color="#f5f0e6" reason={decision.reason} dashed />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Review queue — the human-in-the-loop step incumbents leave manual */}
      <section className="mt-12">
        <h2 className="font-sans text-xl font-bold">
          Review queue{" "}
          <span className="font-mono text-sm font-normal opacity-50">
            flagged by the agent · human decides
          </span>
        </h2>
        <div className="mt-4 space-y-3">
          {flaggedItems.length === 0 ? (
            <div className="border-t border-b border-[#f5f0e6]/10 py-3 font-mono text-sm opacity-35">
              — nothing flagged yet
            </div>
          ) : (
            flaggedItems.map((item) => {
              const acted = queueActions[item.index];
              return (
                <div
                  key={item.index}
                  className="border-l-4 border-[#d85a30] bg-[#d85a30]/5 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <div>
                      <span className="font-sans text-base font-medium">
                        {item.payment.billing_details.name ?? "Unknown sender"}
                      </span>
                      <span className="ml-4 font-mono text-base">{gbp(item.payment.amount)}</span>
                      <StatusChip
                        label={item.decision.type === "PARTIAL" ? "Partial" : "No match"}
                        color="#d85a30"
                        className="ml-4"
                      />
                    </div>
                    {acted ? (
                      <span className="font-mono text-xs uppercase tracking-widest text-[#c8ff00]">
                        {acted === "approved" ? "Approved ✓" : "Reassigned →"}
                      </span>
                    ) : (
                      <div className="flex gap-2">
                        <QueueButton
                          label="Approve"
                          onClick={() =>
                            setQueueActions((prev) => ({ ...prev, [item.index]: "approved" }))
                          }
                        />
                        <QueueButton
                          label="Reassign"
                          onClick={() =>
                            setQueueActions((prev) => ({ ...prev, [item.index]: "reassigned" }))
                          }
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-xs text-[#d85a30]">{item.decision.reason}</p>
                </div>
              );
            })
          )}

          {/* Duplicates are not "needs review" — they're handled by being ignored */}
          {skippedItems.map((item) => (
            <div
              key={item.index}
              className="border border-dashed border-[#f5f0e6]/30 p-4 opacity-60"
            >
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="font-sans text-base">
                  {item.payment.billing_details.name ?? "Unknown sender"}
                </span>
                <span className="font-mono text-base">{gbp(item.payment.amount)}</span>
                <StatusChip label="Skipped" color="#f5f0e6" dim />
              </div>
              <p className="mt-2 font-mono text-xs opacity-70">{item.decision.reason}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Xero invoices */}
      <section className="mt-12">
        <h2 className="font-sans text-xl font-bold">
          Xero invoices{" "}
          <span className="font-mono text-sm font-normal opacity-50">
            GET /Invoices · cached once per run
          </span>
        </h2>
        <div className="mt-4 border-t border-[#f5f0e6]/15">
          {initialInvoices.map((inv) => {
            const paid = paidInvoiceIds.has(inv.InvoiceID);
            return (
              <div
                key={inv.InvoiceID}
                className="grid grid-cols-[8rem_1fr_8rem_8rem_auto] items-baseline gap-x-6 border-b border-[#f5f0e6]/10 py-3"
              >
                <span className="font-mono text-sm">{inv.InvoiceNumber}</span>
                <span className="font-sans text-base">{inv.Contact.Name}</span>
                <span className="font-mono text-sm">{gbpPounds(inv.Total)}</span>
                <span className="font-mono text-sm opacity-60">
                  due {paid ? gbpPounds(0) : gbpPounds(inv.AmountDue)}
                </span>
                {paid ? (
                  <StatusChip label="Paid ✓" color="#1d9e75" />
                ) : (
                  <StatusChip label="Open" color="#f5f0e6" dim />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Fee expenses — the split-out Stripe fees, booked as spend money */}
      <section className="mt-12">
        <h2 className="font-sans text-xl font-bold">
          Fee expenses{" "}
          <span className="font-mono text-sm font-normal opacity-50">
            POST /BankTransactions · spend money
          </span>
        </h2>
        <div className="mt-4 border-t border-[#f5f0e6]/15">
          {visibleTxns.length === 0 ? (
            <div className="border-b border-[#f5f0e6]/10 py-3 font-mono text-sm opacity-35">
              — none booked yet
            </div>
          ) : (
            visibleTxns.map((bt) => (
              <div
                key={bt.BankTransactionID}
                className="grid grid-cols-[1fr_10rem_8rem_auto] items-baseline gap-x-6 border-b border-[#f5f0e6]/10 py-3"
              >
                <span className="font-sans text-base">{bt.LineItems[0].Description}</span>
                <span className="font-mono text-sm opacity-60">
                  {bt.LineItems[0].AccountCode} · Bank Fees
                </span>
                <span className="font-mono text-sm text-[#eda100]">{gbpPounds(bt.Total)}</span>
                <StatusChip label="Booked" color="#eda100" />
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="border border-[#f5f0e6]/15 p-5">
      <div className="font-mono text-xs uppercase tracking-widest opacity-50">{label}</div>
      <div className="mt-2 font-mono text-5xl font-bold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1 font-mono text-xs opacity-45">{sub}</div>}
    </div>
  );
}

function Outcome({
  chip,
  color,
  reason,
  dashed,
}: {
  chip: string;
  color: string;
  reason: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3">
      <StatusChip label={chip} color={color} dashed={dashed} />
      <span className="font-mono text-xs" style={{ color, opacity: dashed ? 0.7 : 1 }}>
        {reason}
      </span>
    </span>
  );
}

function StatusChip({
  label,
  color,
  dim,
  dashed,
  className,
}: {
  label: string;
  color: string;
  dim?: boolean;
  dashed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-xs uppercase tracking-widest ${className ?? ""}`}
      style={{
        color,
        borderColor: color,
        opacity: dim ? 0.35 : 1,
        borderStyle: dashed ? "dashed" : "solid",
      }}
    >
      {label}
    </span>
  );
}

function QueueButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-[#f5f0e6]/40 px-4 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors hover:border-[#c8ff00] hover:text-[#c8ff00]"
    >
      {label}
    </button>
  );
}
