import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useResultAction } from "@/components/ui/use-result-action";
import { offlineDb } from "@/lib/offline/db";
import { outboxEntries } from "@/lib/offline/outbox";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

afterEach(() => {
  vi.clearAllMocks();
});

test("[FR-049] a product edit made offline is refused with a message and nothing is queued", async () => {
  // A server action called without a connection rejects before reaching the server.
  const updateProduct = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  const onSuccess = vi.fn();
  const { result } = renderHook(() => useResultAction());

  await act(async () => {
    result.current.run(updateProduct, { success: "Saved.", onSuccess });
  });

  expect(updateProduct).toHaveBeenCalledOnce();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    "Couldn't reach the server. Check your connection and try again.",
  );
  expect(result.current.pending).toBe(false);
  // Edits other than sales, refunds, and restocks never go to the outbox.
  expect(await outboxEntries(offlineDb())).toEqual([]);
});
