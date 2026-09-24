"use client";

// FR-004: the owner permanently deletes a discontinued product. Past sales and history keep
// its name and code, which the confirmation says.
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useResultAction } from "@/components/ui/use-result-action";
import { deleteProduct } from "./actions";

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { pending, run } = useResultAction();
  return (
    <ConfirmButton
      icon={Trash2}
      label="Delete product"
      question={`Delete ${name} permanently? Only do this if it's discontinued. Past sales and history will still show it.`}
      confirmLabel="Yes, delete"
      pending={pending}
      onConfirm={() =>
        run(() => deleteProduct({ id }), {
          success: `${name} deleted.`,
          onSuccess: () => router.push("/products"),
        })
      }
    />
  );
}
