// The inventory history page (FR-010–012; leaf 3.4), drawn by the server page online and by the
// offline app from the device store (leaf 9.2).
import type { Result } from "@/lib/result";
import { HistoryList } from "./history-list";
import type { HistoryPage } from "./queries";

export function HistoryView({ history }: { history: Result<HistoryPage> }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-text">Inventory history</h1>
        <p className="text-muted mt-1">
          Every change to stock and product details, and who made it.
        </p>
      </div>
      {history.ok ? (
        <HistoryList data={history.data} />
      ) : (
        <p role="alert" className="text-danger">
          {history.error.message}
        </p>
      )}
    </div>
  );
}
