"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button variant="ghost" icon={RotateCw} className="mt-3" onClick={() => location.reload()}>
      Try again
    </Button>
  );
}
