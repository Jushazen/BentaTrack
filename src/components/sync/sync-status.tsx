"use client";

// Online/offline indicator and the changes waiting to sync (FR-035, FR-051, FR-053, §3.4).
// Leaf 6.2; every kind of change since leaf 9.4. Sits in the shell's top bar. Keeps the outbox
// moving: it replays when the app opens, when the connection comes back, when the app returns to
// the foreground, when a change is queued, and every 30 seconds while something is waiting. Tells the user when a sync finishes or fails. Opens a panel listing what
// is waiting, with "Sync now" and, for a change the server refused, a deliberate "Discard".
import { format } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, RefreshCw, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { showLowStockAlerts } from "@/components/layout/low-stock-alerts";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { forgetSnapshotCursor, refreshCatalog } from "@/lib/offline/catalog";
import type { OutboxEntry } from "@/lib/offline/db";
import { outboxEntries, readEntry, removeEntry, type SyncUser } from "@/lib/offline/outbox";
import {
  flushOutbox,
  lowStockAlertsFrom,
  OUTBOX_QUEUED_EVENT,
  setSyncUser,
  type FlushReport,
} from "@/lib/offline/sync";

const RETRY_EVERY_MS = 30_000;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

type Row = {
  id: string;
  summary: string;
  createdAt: number;
  /** Why the server refused it; null while it is just waiting. */
  refusedBecause: string | null;
  /** Set when someone other than the signed-in user recorded it. */
  otherUser: string | null;
};

function toRows(entries: OutboxEntry[], userId: string): Row[] {
  return entries.map((raw) => {
    const entry = readEntry(raw);
    return {
      id: raw.id,
      summary: entry?.payload.summary ?? "Unreadable change",
      createdAt: raw.createdAt,
      refusedBecause: raw.lastError,
      otherUser: entry && entry.payload.userId !== userId ? entry.payload.userName : null,
    };
  });
}

async function readOutbox(): Promise<OutboxEntry[]> {
  try {
    return await outboxEntries();
  } catch {
    // No IndexedDB on this device (e.g. private mode): nothing can be waiting.
    return [];
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

function announce(report: FlushReport, manual: boolean, waiting: number) {
  const synced = report.synced.length;
  if (synced > 0) {
    toast.success(`Sync complete: ${plural(synced, "change", "changes")} saved to the server.`, {
      id: "sync-complete",
    });
  }
  if (report.refused.length > 0) {
    const [first] = report.refused;
    toast.error(
      `${plural(report.refused.length, "change", "changes")} couldn't sync. Open “Sync” to see why.`,
      { id: "sync-refused", description: `${first.summary}: ${first.message}`, duration: 10_000 },
    );
  }
  if (report.stopped === "signed-out") {
    toast.error("Sync failed: please log in again to sync the changes saved on this device.", {
      id: "sync-signed-out",
    });
  } else if (report.stopped === "offline" && manual) {
    toast.error("Sync failed: couldn't reach the server. Changes stay on this device for now.", {
      id: "sync-offline",
    });
  } else if (manual && synced === 0 && report.refused.length === 0) {
    toast.success(waiting > 0 ? "Nothing more can sync right now." : "Everything is synced.", {
      id: "sync-complete",
    });
  }
}

export function SyncStatus({ user }: { user: SyncUser }) {
  const router = useRouter();
  const online = useOnline();
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const entries = useLiveQuery(readOutbox, [], []);
  const rows = toRows(entries, user.id);
  const mine = rows.filter((row) => row.otherUser === null);
  const waiting = mine.filter((row) => row.refusedBecause === null).length;
  const refused = mine.length - waiting;

  useEffect(() => {
    setSyncUser(user);
    return () => setSyncUser(null);
  }, [user]);

  const sync = useCallback(
    async (manual: boolean) => {
      if (!navigator.onLine) {
        if (manual) {
          toast.error("You're offline. Changes will sync when you're back online.", {
            id: "sync-offline",
          });
        }
        return;
      }
      setSyncing(true);
      try {
        const report = await flushOutbox({ includeRefused: manual });
        const left = (await readOutbox()).length;
        announce(report, manual, left);
        if (report.synced.length > 0) {
          showLowStockAlerts(lowStockAlertsFrom(report), (productId) =>
            router.push(`/products/${productId}`),
          );
          router.refresh();
        }
        // Synced changes are now the server's; refused ones must leave the device's copy.
        if (report.synced.length > 0 || report.refused.length > 0) {
          void refreshCatalog().catch(() => undefined);
        }
      } catch {
        if (manual) toast.error("Sync failed. Please try again.", { id: "sync-offline" });
      } finally {
        setSyncing(false);
      }
    },
    [router],
  );

  // When the app opens, when the connection returns, and when it comes back to the foreground.
  useEffect(() => {
    const onOnline = () => void sync(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync(false);
    };
    // After the first paint, so opening the app is never held up by a sync.
    const onOpen = window.setTimeout(() => void sync(false), 0);
    window.addEventListener("online", onOnline);
    window.addEventListener(OUTBOX_QUEUED_EVENT, onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(onOpen);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(OUTBOX_QUEUED_EVENT, onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  // A change queued while the device looked online (e.g. the server was unreachable) retries.
  useEffect(() => {
    if (waiting === 0 || !online) return;
    const timer = window.setInterval(() => void sync(false), RETRY_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, online, sync]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  async function discard(id: string) {
    try {
      await removeEntry(id);
      // The device still shows what it did until a full download replaces it.
      await forgetSnapshotCursor();
      toast.success("Discarded. It won't be sent to the server.");
    } catch {
      toast.error("Couldn't discard it. Please try again.");
      return;
    }
    if (navigator.onLine) void refreshCatalog().catch(() => undefined);
  }

  const Icon = online ? Wifi : WifiOff;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="sync-status"
        className={`hover:bg-secondary flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm ${
          online ? "text-muted" : "text-warn font-medium"
        }`}
      >
        <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        <span>{online ? "Online" : "Offline"}</span>
        {mine.length > 0 && (
          <span
            className={`bg-secondary rounded-full px-2 py-0.5 text-xs font-semibold ${
              refused > 0 ? "text-danger" : "text-warn"
            }`}
          >
            {mine.length} waiting<span className="hidden sm:inline"> to sync</span>
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="sync-title"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        className="bg-surface text-text m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-black/40"
      >
        <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="sync-title" className="font-semibold">
            Sync
          </h2>
          <Button variant="ghost" icon={X} onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-muted text-sm" role="status">
            {online
              ? "You're online. Changes are saved to the server as you make them."
              : "You're offline. Changes are saved on this device and sync when you're back online."}
          </p>

          {rows.length === 0 ? (
            <p className="text-text">Everything is synced.</p>
          ) : (
            <ul aria-label="Changes waiting to sync" className="divide-border divide-y">
              {rows.map((row) => (
                <li key={row.id} aria-label={row.summary} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-text font-medium">{row.summary}</p>
                    <p className="text-muted text-sm tabular-nums">
                      {format(row.createdAt, "d MMM, h:mm a")}
                    </p>
                  </div>
                  {row.otherUser !== null ? (
                    <p className="text-muted text-sm">
                      Recorded by {row.otherUser}. It syncs when they log in on this device.
                    </p>
                  ) : row.refusedBecause !== null ? (
                    <>
                      <p className="text-danger flex items-start gap-2 text-sm">
                        <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" />
                        <span>Couldn&apos;t sync: {row.refusedBecause}</span>
                      </p>
                      <ConfirmButton
                        icon={Trash2}
                        label="Discard"
                        question="Discard this change? It will never reach the server."
                        confirmLabel="Yes, discard"
                        onConfirm={() => discard(row.id)}
                      />
                    </>
                  ) : (
                    <p className="text-muted text-sm">Waiting to sync.</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Button
            icon={RefreshCw}
            onClick={() => void sync(true)}
            disabled={syncing || !online || mine.length === 0}
            className="w-full"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
