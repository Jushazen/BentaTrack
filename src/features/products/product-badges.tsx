// Stock status labels (FR-006, FR-009): Low Stock and Out of Stock are separate labels with
// separate colours, and the text always names the status.
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { STOCK_STATUS_LABEL, type StockStatus } from "@/lib/stock-status";

const STATUS_TONE: Record<StockStatus, BadgeTone> = {
  ACTIVE: "ok",
  LOW_STOCK: "warn",
  OUT_OF_STOCK: "danger",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>;
}

/** Owner only: a staff-added product still waiting for its purchase price (A7 follow-on). */
export function NeedsCostBadge() {
  return <Badge tone="warn">Needs cost</Badge>;
}
