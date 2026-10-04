// Sales reports (FR-021, FR-022, FR-047). Leaf 5.1. Owner only. The page itself is ReportView,
// which the offline app also draws (leaf 9.3).
import type { Metadata } from "next";
import { getSalesReport } from "@/features/reports/queries";
import { ReportView } from "@/features/reports/report-view";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Reports · BentaTrack" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requirePageCapability("reports.read");
  return <ReportView result={await getSalesReport(await searchParams)} />;
}
