// Idempotency store — the reason a redelivered Stripe webhook can never
// double-book. Keyed on the Stripe charge id: if we've processed a charge,
// re-processing it returns DUPLICATE before any matching or writing happens.
//
// Lifetime matches the ledger world it protects (one demo run = one fresh
// world, so the store is created with it). In production this would be a
// durable set (DB unique key / KV) so idempotency holds across processes
// and webhook retries days apart — the decision logic stays identical.
export class IdempotencyStore {
  private seen = new Set<string>();

  has(chargeId: string): boolean {
    return this.seen.has(chargeId);
  }

  record(chargeId: string): void {
    this.seen.add(chargeId);
  }
}
