"use client";

// Signs this device out as soon as the page opens (clearing the session cookie and, through the
// service worker, the saved pages), then goes to the login page with the reason. Owner-only data
// leaves the device first (FR-055, leaf 9.5), as with the Log out button; changes still waiting to
// sync stay (FR-036).
import { LogIn } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { purgeOwnerData } from "@/lib/offline/catalog";

async function signOutAndPurge(loginUrl: string) {
  try {
    await purgeOwnerData();
  } catch {
    // No IndexedDB here (e.g. private mode), so nothing was stored.
  }
  await signOut({ callbackUrl: loginUrl });
}

export function SignOutNow({ loginUrl }: { loginUrl: string }) {
  useEffect(() => {
    void signOutAndPurge(loginUrl);
  }, [loginUrl]);

  return (
    <Button
      variant="secondary"
      icon={LogIn}
      className="mt-6"
      onClick={() => void signOutAndPurge(loginUrl)}
    >
      Go to login
    </Button>
  );
}
