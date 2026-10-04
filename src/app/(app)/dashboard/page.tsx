// Dashboard (FR-023–025). Leaf 5.2. The page itself is DashboardView, which the offline app also
// draws (leaf 9.3).
import type { Metadata } from "next";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { getDashboard } from "@/features/dashboard/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard · BentaTrack" };

export default async function DashboardPage() {
  await requirePageCapability("dashboard.staff");
  return <DashboardView result={await getDashboard()} />;
}
