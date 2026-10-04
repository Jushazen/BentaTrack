// My account (owner only; amendment H2, FR-060). Leaf 8.1. The page itself is AccountView, which
// the offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { PASSWORD_MIN_LENGTH, requirePageCapability } from "@/lib/auth";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "My account · BentaTrack" };

export default async function AccountPage() {
  const user = await requirePageCapability("account.password");
  return <AccountView user={user} passwordMinLength={PASSWORD_MIN_LENGTH} />;
}
