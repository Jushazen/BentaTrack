"use client";

// USB and Bluetooth barcode scanners act as keyboards ("keyboard wedge"): they type the code
// very fast and press Enter (FR-028). This tells a scan apart from a person typing by the gap
// between keys, so a scan anywhere on the page is caught even when no search box has focus.
import { useEffect, useRef } from "react";

/** Scanners send a key every few ms; people rarely type faster than one key per ~80 ms. */
export const MAX_KEY_GAP_MS = 50;
export const MIN_CODE_LENGTH = 4;

/** Collects fast keystrokes. `push` returns the scanned code when Enter ends a fast burst. */
export class WedgeBuffer {
  private chars = "";
  private last = -Infinity;

  constructor(
    private readonly maxGapMs = MAX_KEY_GAP_MS,
    private readonly minLength = MIN_CODE_LENGTH,
  ) {}

  push(key: string, time: number): string | null {
    const gap = time - this.last;
    this.last = time;
    if (key === "Enter") {
      const code = gap <= this.maxGapMs && this.chars.length >= this.minLength ? this.chars : null;
      this.chars = "";
      return code;
    }
    if (key.length !== 1) {
      // Shift and other non-printing keys don't break a burst (scanners send Shift for capitals).
      return null;
    }
    this.chars = gap <= this.maxGapMs ? this.chars + key : key;
    return null;
  }

  reset() {
    this.chars = "";
    this.last = -Infinity;
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "submit"].includes(target.type)
  );
}

/**
 * Calls `onScan` when a scanner types a code while focus is NOT in a text field. Text fields
 * (like the product search box) receive the code themselves and handle Enter on their own.
 */
export function useBarcodeWedge(onScan: (code: string) => void, enabled = true) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const buffer = new WedgeBuffer();
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) {
        buffer.reset();
        return;
      }
      const code = buffer.push(event.key, event.timeStamp);
      if (code) {
        event.preventDefault();
        onScanRef.current(code);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
