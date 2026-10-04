"use client";

// FR-004, H1: the owner archives a discontinued product and restores it later. Nothing is deleted:
// stock, photo, sales, and history stay, which the confirmation says. Saved through the outbox, so
// it works offline too (leaf 9.4).
import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useResultAction } from "@/components/ui/use-result-action";
import { runCommand } from "@/lib/offline/sync";

const QUEUED = "It's saved on this device and will sync when you're back online.";

/** One archive or restore, with its own id and the device's time. */
function command(id: string) {
  return { id, commandId: crypto.randomUUID(), occurredAt: new Date().toISOString() };
}

export function ArchiveProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { pending, run } = useResultAction();
  return (
    <ConfirmButton
      icon={Archive}
      label="Archive product"
      question={`Archive ${name}? Only do this if it's discontinued. It can't be sold until you restore it; its stock and history are kept.`}
      confirmLabel="Yes, archive"
      pending={pending}
      onConfirm={() =>
        run(() => runCommand("PRODUCT_ARCHIVE", command(id)), {
          success: (result) => `${name} archived.${result.queued ? ` ${QUEUED}` : ""}`,
          onSuccess: (result) => {
            if (!result.queued) router.refresh();
          },
        })
      }
    />
  );
}

export function RestoreProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { pending, run } = useResultAction();
  return (
    <ConfirmButton
      icon={ArchiveRestore}
      label="Restore product"
      question={`Restore ${name}? It can be sold and restocked again.`}
      confirmLabel="Yes, restore"
      variant="primary"
      pending={pending}
      onConfirm={() =>
        run(() => runCommand("PRODUCT_RESTORE", command(id)), {
          success: (result) => `${name} restored.${result.queued ? ` ${QUEUED}` : ""}`,
          onSuccess: (result) => {
            if (!result.queued) router.refresh();
          },
        })
      }
    />
  );
}
