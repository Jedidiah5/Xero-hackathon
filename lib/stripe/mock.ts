import type { StripeCharge } from "./types";

// The six demo payments — CLAUDE.md section 3, in narrative order.
// Amounts in pence. #6 is a duplicate webhook delivery of #1: same charge id.

const charge = (
  id: string,
  amountPence: number,
  feePence: number,
  name: string | null,
  invoiceNumber: string | undefined,
  description: string | null,
  createdOffsetMin: number
): StripeCharge => ({
  id,
  object: "charge",
  amount: amountPence,
  currency: "gbp",
  created: 1751623200 + createdOffsetMin * 60, // Fri 4 Jul 2026, ~11:00 BST
  status: "succeeded",
  description,
  billing_details: { name, email: null },
  metadata: invoiceNumber ? { invoice_number: invoiceNumber } : {},
  balance_transaction: {
    id: `txn_${id.slice(3)}`,
    amount: amountPence,
    fee: feePence,
    net: amountPence - feePence,
    currency: "gbp",
  },
});

export const mockStripePayments: StripeCharge[] = [
  // 1 — Northwind Café £420.00 → clean match, INV-1042 marked paid
  charge("ch_3PkNw1042aA", 42000, 0, "Northwind Café", "INV-1042", "Payment for INV-1042", 0),

  // 2 — Brightside Studio £1,200.00 → match INV-1051; £34.80 fee split to expense
  charge("ch_3PkBr1051bB", 120000, 3480, "Brightside Studio", "INV-1051", "Payment for INV-1051", 4),

  // 3 — Harbour Goods £315.50 → clean match, INV-1039 marked paid
  charge("ch_3PkHg1039cC", 31550, 0, "Harbour Goods", "INV-1039", "Payment for INV-1039", 9),

  // 4 — Meadow & Co £500.00 → partial payment of INV-1047 (£850) → flagged
  charge("ch_3PkMc1047dD", 50000, 0, "Meadow & Co", "INV-1047", "Part payment", 15),

  // 5 — Unknown sender £90.00 → no reference, no matching invoice → flagged
  charge("ch_3PkUnknwn5eE", 9000, 0, null, undefined, null, 22),

  // 6 — duplicate webhook delivery of #1: identical charge id → detected + skipped
  charge("ch_3PkNw1042aA", 42000, 0, "Northwind Café", "INV-1042", "Payment for INV-1042", 0),
];
