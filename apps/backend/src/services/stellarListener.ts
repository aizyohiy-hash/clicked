/**
 * Stellar event listener for `token_transfer` (#46).
 *
 * Subscribes to contract events emitted by the `token_transfer` Soroban
 * contract and writes each into the `token_transfers` table. The listener:
 *
 *   - Polls Soroban RPC `getEvents` on a short interval (cursor-based),
 *     which is the supported pattern in stellar-sdk's `rpc` module today.
 *   - Reconnects automatically after a transient failure with exponential
 *     backoff capped at 30 seconds.
 *   - Upserts on the unique `tx_hash` so a reconnect that re-reads a page
 *     of events produces no duplicates.
 *   - Logs errors via the standard backend logger but never rethrows out
 *     of `runForever`, so the API server stays up even if the chain is
 *     unreachable.
 *
 * The actual fetch is wrapped behind a `fetchEvents` dependency so the
 * unit tests under `__tests__/stellarListener.test.ts` can drive the
 * loop deterministically without hitting Soroban RPC.
 */
import { rpc } from '@stellar/stellar-sdk';
import { db } from '../db/index.js';
import { tokenTransfers, messages } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_MAX_MS = 30_000;

export interface StellarTransferEvent {
  /** Soroban tx hash that produced the event. */
  txHash: string;
  /** Ledger sequence the event was included in. */
  ledger: number;
  /** Stellar address that authorised the transfer. */
  from: string;
  /** Stellar address that received the transfer. */
  to: string;
  /** Amount in token units (i128 as decimal string). */
  amount: string;
  /** Raw memo bytes hex-encoded (matches the contract's emitted memo). */
  memoHex?: string;
  /** Cursor token the next `fetchEvents` call should resume from. */
  cursor: string;
}

export interface StellarListenerDeps {
  /** Optional logger; defaults to a console wrapper. */
  log?: {
    info: (msg: string, ctx?: unknown) => void;
    warn: (msg: string, ctx?: unknown) => void;
    error: (msg: string, ctx?: unknown) => void;
  };
  /** Fetches the next page of events starting at `cursor`. Must throw on
   *  network / RPC failures so the listener can apply backoff. */
  fetchEvents: (cursor: string | null) => Promise<StellarTransferEvent[]>;
  /** Persistence layer; swapped out in tests. */
  persistEvent?: (event: StellarTransferEvent) => Promise<void>;
  /** Pause between successful polls (default 5s). */
  pollIntervalMs?: number;
  /** Initial backoff after a failure (doubles up to `backoffMaxMs`). */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Abort signal that breaks out of `runForever`. */
  signal?: AbortSignal;
}

const consoleLogger = {
  info: (msg: string, ctx?: unknown) => console.log(`[stellar-listener] ${msg}`, ctx ?? ''),
  warn: (msg: string, ctx?: unknown) => console.warn(`[stellar-listener] ${msg}`, ctx ?? ''),
  error: (msg: string, ctx?: unknown) => console.error(`[stellar-listener] ${msg}`, ctx ?? ''),
};

/**
 * Default persistence: upsert on `txHash`, attempting to associate the
 * transfer with a message whose id matches the decoded memo bytes (if any).
 */
async function defaultPersistEvent(event: StellarTransferEvent): Promise<void> {
  let messageId: string | null = null;
  if (event.memoHex) {
    try {
      const memo = Buffer.from(event.memoHex, 'hex').toString('utf-8').trim();
      // The contract emits a message UUID in the memo when the transfer
      // originated from a chat message; non-UUID memos are ignored.
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memo)) {
        const [existing] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.id, memo))
          .limit(1);
        if (existing) messageId = existing.id;
      }
    } catch {
      // Non-fatal — memo just stays raw, no association.
    }
  }

  await db
    .insert(tokenTransfers)
    .values({
      txHash: event.txHash,
      ledger: event.ledger,
      fromAddress: event.from,
      toAddress: event.to,
      amount: event.amount,
      memoHex: event.memoHex ?? null,
      messageId,
    })
    .onConflictDoUpdate({
      target: tokenTransfers.txHash,
      set: {
        // Touch observedAt + ledger on duplicate so a re-emitted event
        // updates the row instead of being silently dropped.
        ledger: sql`EXCLUDED.ledger`,
        observedAt: sql`now()`,
      },
    });
}

/**
 * Run the listener loop until `signal` aborts (or process exit). Never
 * throws — RPC / DB errors are logged and the loop backs off.
 */
export async function runForever(deps: StellarListenerDeps): Promise<void> {
  const log = deps.log ?? consoleLogger;
  const persist = deps.persistEvent ?? defaultPersistEvent;
  const pollMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const backoffBase = deps.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const backoffMax = deps.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;

  let cursor: string | null = null;
  let consecutiveFailures = 0;

  log.info('listener starting');

  while (!deps.signal?.aborted) {
    try {
      const events = await deps.fetchEvents(cursor);
      consecutiveFailures = 0;

      for (const event of events) {
        try {
          await persist(event);
          cursor = event.cursor;
        } catch (err) {
          // Per-event failure: log and move on so one bad row doesn't
          // freeze the cursor. cursor is NOT advanced here so the next
          // poll retries.
          log.warn('failed to persist event', {
            txHash: event.txHash,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await wait(pollMs, deps.signal);
    } catch (err) {
      consecutiveFailures += 1;
      const delay = Math.min(
        backoffBase * Math.pow(2, consecutiveFailures - 1),
        backoffMax,
      );
      log.error('fetch failed; reconnecting after backoff', {
        attempt: consecutiveFailures,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });
      await wait(delay, deps.signal);
    }
  }

  log.info('listener stopped (signal aborted)');
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// ── Production wiring ────────────────────────────────────────────────────────

/**
 * Build a default fetcher that talks to a Soroban RPC server and filters
 * events by the configured `token_transfer` contract id. Returns a thunk
 * suitable for passing into `runForever({ fetchEvents })`.
 */
export function buildRpcFetcher(opts: {
  rpcUrl: string;
  contractId: string;
  pageSize?: number;
}): StellarListenerDeps['fetchEvents'] {
  const server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith('http://') });
  const pageSize = opts.pageSize ?? 100;

  return async (cursor) => {
    const startLedger = cursor ? undefined : undefined; // resume on cursor only
    const response = await (server as any).getEvents({
      startLedger,
      cursor: cursor ?? undefined,
      filters: [
        {
          type: 'contract',
          contractIds: [opts.contractId],
          topics: [['transfer']],
        },
      ],
      limit: pageSize,
    });

    const events = (response?.events ?? []) as Array<{
      txHash?: string;
      ledger?: number;
      value?: { from?: string; to?: string; amount?: string | number; memo?: string };
      pagingToken?: string;
    }>;

    return events
      .filter((e) => e.txHash && e.value?.from && e.value?.to && e.value?.amount != null)
      .map((e) => ({
        txHash: e.txHash as string,
        ledger: e.ledger ?? 0,
        from: e.value!.from as string,
        to: e.value!.to as string,
        amount: String(e.value!.amount),
        memoHex: e.value?.memo,
        cursor: e.pagingToken ?? '',
      }));
  };
}
