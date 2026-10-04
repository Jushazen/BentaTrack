// The offline app (§3.1, FR-049; leaves 6.1 and 9.2). Static and public, so it is precached at
// install and needs no server. The service worker shows it for any page the network can't
// deliver; OfflineApp then draws that page from the device store, or the plain offline notice
// before the signed-in user's data is on this device.
import type { Metadata } from "next";
import ForbiddenPage from "../(auth)/forbidden/page";
import { OfflineApp } from "./offline-app";

export const metadata: Metadata = { title: "Offline · BentaTrack" };

export default function OfflinePage() {
  // Staff opening an owner-only page offline see what the proxy would send them to online.
  return <OfflineApp forbidden={<ForbiddenPage />} />;
}
