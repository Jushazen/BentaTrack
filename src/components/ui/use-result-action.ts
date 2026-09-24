"use client";

// Runs a server action that returns Result<T> (src/lib/result.ts): tracks pending state, keeps
// per-field errors for the form, and shows a toast for success or failure. A thrown call means
// the request never reached the server (e.g. offline; FR-049 says these edits need a connection).
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "@/lib/result";

type RunOptions<T> = {
  success: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
};

export function useResultAction() {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function run<T>(action: () => Promise<Result<T>>, { success, onSuccess }: RunOptions<T>) {
    startTransition(async () => {
      let result: Result<T>;
      try {
        result = await action();
      } catch {
        toast.error("Couldn't reach the server. Check your connection and try again.");
        return;
      }
      if (result.ok) {
        setFieldErrors({});
        toast.success(typeof success === "function" ? success(result.data) : success);
        onSuccess?.(result.data);
        return;
      }
      setFieldErrors(result.error.fieldErrors ?? {});
      toast.error(result.error.message);
    });
  }

  return { pending, fieldErrors, run, clearErrors: () => setFieldErrors({}) };
}
