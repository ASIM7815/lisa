import { driver } from "@/lib/db";

/**
 * File-store writes are serialized and atomic. Postgres compound transitions
 * are intentionally performed via individual idempotent writes at this stage;
 * see the transaction-boundary risk noted in docs/ARCHITECTURE.md.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  void driver;
  return fn();
}
