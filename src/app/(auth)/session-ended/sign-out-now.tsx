"use client";

// Signs this device out as soon as the page opens (clearing the session cookie and, through the
// service worker, the saved pages), then goes to the login page with the reason.
import { LogIn } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function SignOutNow({ loginUrl }: { loginUrl: string }) {
  useEffect(() => {
    void signOut({ callbackUrl: loginUrl });
  }, [loginUrl]);

  return (
    <Button
      variant="secondary"
      icon={LogIn}
      className="mt-6"
      onClick={() => void signOut({ callbackUrl: loginUrl })}
    >
      Go to login
    </Button>
  );
}
