"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BankTransaction, Invoice } from "@/lib/xero/types";
import type { StripeCharge } from "@/lib/stripe/types";
import type { ReconcileResult } from "@/lib/agent/reconcile";
import ReconcileFlow from "./reconcile-flow";

const REVEAL_MS = 750;

const INK = "#1c1915";
const MUTED = "#5f584a";
const ACCENT = "#6c4df6";
const MATCHED = "#0fa36b";
const FEE = "#d97706";
const FLAGGED = "#e8553a";

const AVATAR_PALETTE = [
  "#6c4df6",
  "#0fa36b",
  "#0891b2",
  "#d97706",
  "#e8553a",
  "#db2777",
  "#4f46e5",
];

const gbp = (pence: number) =>
  (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const gbpPounds = (pounds: number) =>
  pounds.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

type QueueAction = "approved" | "reassigned";

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function avatarColor(name: string | null) {
  const s = name ?? "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}

export default function Dashboard({
  initialPayments,
  initialInvoices,
}: {
  initialPayments: StripeCharge[];
  initialInvoices: Invoice[];
}) {
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
  const reconciled = matchedCount + feeSplitCount;
  const progress = hasRun ? 100 : running ? Math.round((revealed.length / initialPayments.length) * 100) : 0;

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
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--ring)] glass-panel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6c4df6] to-[#8b5cf6] text-lg font-bold text-white shadow-[0_4px_14px_rgba(108,77,246,0.4)]">
              L
            </div>
            <div>
              <div className="font-sans text-lg font-bold tracking-tight">
                Ledger<span className="text-[#6c4df6]">.</span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Stripe → Xero agent
              </div>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/connection"
              className="flex items-center gap-1.5 rounded-full border border-[var(--ring)] bg-white/80 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] transition-colors hover:border-[#0fa36b] hover:text-[#0fa36b]"
            >
              <span className="h-2 w-2 rounded-full bg-[#0fa36b]" />
              Live connection
            </Link>
            <IntegrationPill label="Stripe" color="#635bff" />
            <IntegrationPill label="Xero" color="#13b5ea" />
            <span className="hidden rounded-full bg-[var(--accent-soft)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#6c4df6] sm:inline">
              mock mode
            </span>
            {running && (
              <span className="flex items-center gap-2 rounded-full bg-[#ede9fe] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#6c4df6]">
                <span className="live-dot h-2 w-2 rounded-full bg-[#6c4df6]" />
                Agent running
              </span>
            )}
            <button
              onClick={run}
              disabled={running}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#6c4df6] to-[#7c3aed] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-[0_4px_20px_rgba(108,77,246,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(108,77,246,0.5)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              <span className="relative z-10">
                {running ? "Running…" : hasRun ? "↺ Replay" : "▶ Run agent"}
              </span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Hero intro */}
        <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#6c4df6]">
              AI reconciliation
            </p>
            <h1 className="mt-2 font-sans text-3xl font-bold leading-tight tracking-tight md:text-4xl">
              Match payments to invoices.
              <br />
              <span className="text-[var(--muted)]">Split fees. Flag the mess.</span>
            </h1>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-[var(--muted)]">
              Six Stripe payments hit your bank feed. The agent finds the open Xero invoice,
              books the Stripe fee, and routes ambiguity to you — not a guess.
            </p>
          </div>

          {(running || hasRun) && (
            <div className="glass-panel w-full max-w-xs rounded-2xl p-4 lg:w-72">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                <span>Run progress</span>
                <span className="font-bold text-[#6c4df6]">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ede9fe]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#6c4df6] to-[#0fa36b] transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">
                {revealed.length} of {initialPayments.length} decisions revealed
              </p>
            </div>
          )}
        </section>

        {/* 3D flow — gradient frame */}
        <div className="gradient-ring mb-8 hidden md:block">
          <div className="gradient-ring-inner">
            <ReconcileFlow
              payments={initialPayments}
              invoices={initialInvoices}
              results={results}
            />
          </div>
        </div>

        {/* Stats bento */}
        <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Incoming"
            value={initialPayments.length}
            icon="↓"
            gradient="from-[#ede9fe] to-white"
            accent={ACCENT}
            sub={skippedItems.length > 0 ? `${skippedItems.length} duplicate skipped` : "webhooks today"}
          />
          <StatCard
            label="Reconciled"
            value={reconciled}
            icon="✓"
            gradient="from-[#d1fae5] to-white"
            accent={MATCHED}
            sub={reconciled > 0 ? "marked paid in Xero" : "waiting for agent"}
          />
          <StatCard
            label="Fees split"
            value={feeSplitCount}
            icon="◎"
            gradient="from-[#fef3c7] to-white"
            accent={FEE}
            sub={feeSplitCount > 0 ? "booked to expense" : "no fees yet"}
          />
          <StatCard
            label="Flagged"
            value={flaggedItems.length}
            icon="!"
            gradient="from-[#fee2e2] to-white"
            accent={FLAGGED}
            sub={flaggedItems.length > 0 ? "needs your call" : "queue clear"}
          />
        </div>

        {/* Main grid: payments + review */}
        <div className="grid gap-8 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <SectionHeader
              title="Incoming payments"
              subtitle="Stripe charges · agent decides each one"
              badge={`${initialPayments.length} total`}
            />
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div className="hidden border-b border-[var(--ring)] bg-[#faf8f5]/80 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)] md:grid md:grid-cols-[2.5rem_1fr_6rem_6rem_1fr] md:gap-4">
                <span>#</span>
                <span>Customer</span>
                <span>Amount</span>
                <span>Reference</span>
                <span>Outcome</span>
              </div>
              {initialPayments.map((p, i) => {
                const decision = results[i]?.decision ?? null;
                const isDuplicate = decision?.type === "DUPLICATE";
                const name = p.billing_details.name ?? "Unknown sender";
                return (
                  <div
                    key={`${p.id}-${i}`}
                    className={`border-b border-[var(--ring)] px-5 py-4 transition-all last:border-b-0 hover:bg-[#faf8f5]/60 ${
                      decision ? "animate-in" : ""
                    }`}
                    style={
                      isDuplicate
                        ? { opacity: 0.5 }
                        : decision && decision.type !== "DUPLICATE"
                          ? { background: "rgba(250,248,245,0.5)" }
                          : undefined
                    }
                  >
                    <div className="grid items-center gap-3 md:grid-cols-[2.5rem_1fr_6rem_6rem_1fr] md:gap-4">
                      <span className="font-mono text-xs text-[var(--muted)]">{i + 1}</span>
                      <div className="flex items-center gap-3">
                        <Avatar name={name} />
                        <span className="font-sans text-sm font-semibold">{name}</span>
                      </div>
                      <span className="font-mono text-sm font-bold">{gbp(p.amount)}</span>
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {p.metadata.invoice_number ?? "—"}
                      </span>
                      <div>
                        {decision === null ? (
                          <StatusChip label="Pending" color={ACCENT} />
                        ) : decision.type === "MATCH" ? (
                          <Outcome chip="Matched" color={MATCHED} reason={decision.reason} />
                        ) : decision.type === "FEE_SPLIT" ? (
                          <Outcome chip="Fee split" color={FEE} reason={decision.reason} />
                        ) : decision.type === "PARTIAL" ? (
                          <Outcome chip="Partial" color={FLAGGED} reason={decision.reason} />
                        ) : decision.type === "NO_MATCH" ? (
                          <Outcome chip="No match" color={FLAGGED} reason={decision.reason} />
                        ) : (
                          <Outcome
                            chip="Duplicate"
                            color={MUTED}
                            reason={decision.reason}
                            dashed
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-2">
            <SectionHeader
              title="Review queue"
              subtitle="Human-in-the-loop · agent won't guess"
              badge={flaggedItems.length > 0 ? `${flaggedItems.length} open` : "empty"}
              accent={FLAGGED}
            />
            <div className="space-y-3">
              {flaggedItems.length === 0 && skippedItems.length === 0 ? (
                <EmptyState
                  emoji="✨"
                  title="Nothing flagged"
                  text="Run the agent — partial payments and unknown senders land here."
                />
              ) : (
                <>
                  {flaggedItems.map((item) => {
                    const acted = queueActions[item.index];
                    const name = item.payment.billing_details.name ?? "Unknown sender";
                    return (
                      <div
                        key={item.index}
                        className="animate-in overflow-hidden rounded-2xl border border-[#fecaca] bg-gradient-to-br from-[#fff5f5] to-white shadow-[var(--shadow-sm)]"
                      >
                        <div className="h-1 bg-gradient-to-r from-[#e8553a] to-[#f97316]" />
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={name} size="lg" />
                              <div>
                                <div className="font-sans text-sm font-bold">{name}</div>
                                <div className="font-mono text-lg font-bold text-[#e8553a]">
                                  {gbp(item.payment.amount)}
                                </div>
                              </div>
                            </div>
                            <StatusChip
                              label={item.decision.type === "PARTIAL" ? "Partial" : "No match"}
                              color={FLAGGED}
                            />
                          </div>
                          <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-[#b45309]">
                            {item.decision.reason}
                          </p>
                          <div className="mt-4 flex gap-2">
                            {acted ? (
                              <span className="rounded-xl bg-[#ede9fe] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[#6c4df6]">
                                {acted === "approved" ? "Approved ✓" : "Reassigned →"}
                              </span>
                            ) : (
                              <>
                                <QueueButton
                                  label="Approve"
                                  primary
                                  onClick={() =>
                                    setQueueActions((prev) => ({
                                      ...prev,
                                      [item.index]: "approved",
                                    }))
                                  }
                                />
                                <QueueButton
                                  label="Reassign"
                                  onClick={() =>
                                    setQueueActions((prev) => ({
                                      ...prev,
                                      [item.index]: "reassigned",
                                    }))
                                  }
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {skippedItems.map((item) => (
                    <div
                      key={item.index}
                      className="animate-in rounded-2xl border border-dashed border-[var(--ring)] bg-white/60 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={item.payment.billing_details.name ?? "?"}
                          dim
                        />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">
                              {item.payment.billing_details.name ?? "Unknown sender"}
                            </span>
                            <span className="font-mono text-sm">{gbp(item.payment.amount)}</span>
                            <StatusChip label="Skipped" color={MUTED} dim dashed />
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                            {item.decision.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>

        {/* Bottom grid: invoices + fees */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section>
            <SectionHeader
              title="Xero invoices"
              subtitle="GET /Invoices · cached once per run"
              badge={`${paidInvoiceIds.size} paid`}
              accent={MATCHED}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {initialInvoices.map((inv) => {
                const paid = paidInvoiceIds.has(inv.InvoiceID);
                return (
                  <div
                    key={inv.InvoiceID}
                    className={`glass-panel rounded-2xl p-4 transition-all ${
                      paid
                        ? "ring-2 ring-[#0fa36b]/30 bg-gradient-to-br from-[#ecfdf5] to-white"
                        : "hover:shadow-[var(--shadow-md)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs font-bold text-[#5d5648]">
                          {inv.InvoiceNumber}
                        </div>
                        <div className="mt-1 font-sans text-sm font-semibold">
                          {inv.Contact.Name}
                        </div>
                      </div>
                      {paid ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0fa36b] text-sm text-white">
                          ✓
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#eee9dd] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#5d5648]">
                          Open
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <span className="font-mono text-xl font-bold">{gbpPounds(inv.Total)}</span>
                      <span className="font-mono text-[11px] text-[#5d5648]">
                        due {paid ? gbpPounds(0) : gbpPounds(inv.AmountDue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Fee expenses"
              subtitle="POST /BankTransactions · spend money"
              badge={visibleTxns.length > 0 ? `${visibleTxns.length} booked` : "none"}
              accent={FEE}
            />
            {visibleTxns.length === 0 ? (
              <EmptyState
                emoji="💳"
                title="No fees booked yet"
                text="Payment #2 splits the Stripe fee into a bank expense line."
              />
            ) : (
              <div className="space-y-3">
                {visibleTxns.map((bt) => (
                  <div
                    key={bt.BankTransactionID}
                    className="animate-in overflow-hidden rounded-2xl border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white shadow-[var(--shadow-sm)]"
                  >
                    <div className="h-1 bg-gradient-to-r from-[#d97706] to-[#f59e0b]" />
                    <div className="flex items-center justify-between gap-4 p-5">
                      <div>
                        <div className="font-sans text-sm font-semibold">
                          {bt.LineItems[0].Description}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                          {bt.LineItems[0].AccountCode} · Bank Fees
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xl font-bold text-[#d97706]">
                          {gbpPounds(bt.Total)}
                        </div>
                        <StatusChip label="Booked" color={FEE} className="mt-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* ── UI components ─────────────────────────────────────────────── */

function IntegrationPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-[var(--ring)] bg-white/80 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  badge,
  accent = INK,
}: {
  title: string;
  subtitle: string;
  badge: string;
  accent?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-sans text-lg font-bold">{title}</h2>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          {subtitle}
        </p>
      </div>
      <span
        className="rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest"
        style={{ background: `${accent}18`, color: accent }}
      >
        {badge}
      </span>
    </div>
  );
}

function Avatar({
  name,
  size = "md",
  dim,
}: {
  name: string;
  size?: "md" | "lg";
  dim?: boolean;
}) {
  const color = avatarColor(name);
  const sz = size === "lg" ? "h-11 w-11 text-sm" : "h-8 w-8 text-[10px]";
  return (
    <div
      className={`${sz} flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm`}
      style={{
        background: dim ? "#c4bdb0" : `linear-gradient(135deg, ${color}, ${color}cc)`,
      }}
    >
      {initials(name)}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  gradient,
  accent,
  sub,
}: {
  label: string;
  value: number;
  icon: string;
  gradient: string;
  accent: string;
  sub: string;
}) {
  return (
    <div
      className={`glass-panel relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]`}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
          {label}
        </span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ background: accent }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 font-mono text-4xl font-bold" style={{ color: accent }}>
        {value}
      </div>
      <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{sub}</p>
    </div>
  );
}

function EmptyState({
  emoji,
  title,
  text,
}: {
  emoji: string;
  title: string;
  text: string;
}) {
  return (
    <div className="glass-panel rounded-2xl px-6 py-10 text-center">
      <div className="text-3xl">{emoji}</div>
      <div className="mt-2 font-sans text-sm font-bold">{title}</div>
      <p className="mx-auto mt-1 max-w-xs font-mono text-[11px] leading-relaxed text-[var(--muted)]">
        {text}
      </p>
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
    <div className="space-y-1">
      <StatusChip label={chip} color={color} dashed={dashed} />
      <p className="font-mono text-[11px] leading-snug" style={{ color }}>
        {reason}
      </p>
    </div>
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
      className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${className ?? ""}`}
      style={{
        color,
        borderColor: `${color}${dim ? "44" : "55"}`,
        background: dim ? "transparent" : `${color}16`,
        opacity: dim ? 0.55 : 1,
        borderStyle: dashed ? "dashed" : "solid",
      }}
    >
      {label}
    </span>
  );
}

function QueueButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        primary
          ? "rounded-xl bg-[#6c4df6] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-[0_4px_12px_rgba(108,77,246,0.35)] transition-all hover:bg-[#5a3ded]"
          : "rounded-xl border border-[var(--ring)] bg-white px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all hover:border-[#6c4df6] hover:text-[#6c4df6]"
      }
    >
      {label}
    </button>
  );
}
