"use client";

// FR-004, H1: the owner archives a discontinued product and restores it later. Nothing is deleted:
// stock, photo, sales, and history stay, which the confirmation says.
import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useResultAction } from "@/components/ui/use-result-action";
import { archiveProduct, restoreProduct } from "./actions";

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
        run(() => archiveProduct({ id }), {
          success: `${name} archived.`,
          onSuccess: () => router.refresh(),
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
        run(() => restoreProduct({ id }), {
          success: `${name} restored.`,
          onSuccess: () => router.refresh(),
        })
      }
    />
  );
}
