"use client";

// Quick product finder for the Products page (FR-026–028): live search by name or code, a
// keyboard-wedge scanner anywhere on the page, and phone-camera scanning. Each opens the product.
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CameraScanButton } from "@/components/scanner/camera-scanner";
import { useBarcodeWedge } from "@/components/scanner/use-barcode-wedge";
import { lookupProductAction } from "./actions";
import { ProductSearch } from "./product-search";
import type { SearchHit } from "./queries";

export function ProductFinder() {
  const router = useRouter();

  function open(hit: SearchHit) {
    router.push(`/products/${hit.id}`);
  }

  async function openScanned(code: string) {
    try {
      const found = await lookupProductAction(code);
      if (!found.ok) toast.error(found.error.message);
      else if (found.data) open(found.data);
      else toast.error(`No product has the barcode “${code}”.`);
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    }
  }

  useBarcodeWedge((code) => void openScanned(code));

  return (
    <div className="bg-surface grid gap-3 rounded-lg p-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <ProductSearch
        onPick={open}
        // Enter on a name opens the full filtered list below instead of guessing one product.
        onNoExactMatch={(query, results) => {
          if (results.length === 1 && results[0]) open(results[0]);
          else router.push(`/products?q=${encodeURIComponent(query)}`);
        }}
        placeholder="Type a name or code, or scan a barcode"
      />
      <CameraScanButton onScan={(code) => void openScanned(code)} />
    </div>
  );
}
