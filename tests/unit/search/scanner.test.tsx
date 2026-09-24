import { render, screen, waitFor } from "@testing-library/react";
import { Html5QrcodeSupportedFormats } from "html5-qrcode";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BARCODE_FORMATS, scannerConfig } from "@/components/scanner/scanner-config";
import { WedgeBuffer } from "@/components/scanner/use-barcode-wedge";

const TWO_D_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.MAXICODE,
  Html5QrcodeSupportedFormats.PDF_417,
];

// Records how the camera component sets up html5-qrcode, without a real camera.
const camera = vi.hoisted(() => ({
  constructed: [] as unknown[][],
  start: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null),
  stop: vi.fn(async () => undefined),
}));
vi.mock("html5-qrcode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("html5-qrcode")>();
  class FakeHtml5Qrcode {
    constructor(...args: unknown[]) {
      camera.constructed.push(args);
    }
    start = camera.start;
    stop = camera.stop;
    clear() {}
  }
  return { ...actual, Html5Qrcode: FakeHtml5Qrcode };
});

afterEach(() => {
  camera.constructed.length = 0;
  vi.clearAllMocks();
});

describe("camera scanner formats", () => {
  test("[FR-029] only 1D barcode formats are enabled; QR and other 2D codes are not", () => {
    for (const format of TWO_D_FORMATS) expect(BARCODE_FORMATS).not.toContain(format);
    for (const format of [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.CODE_128,
    ]) {
      expect(BARCODE_FORMATS).toContain(format);
    }
    expect(scannerConfig().formatsToSupport).toEqual([...BARCODE_FORMATS]);
  });

  test("[FR-029] the camera component starts html5-qrcode with the 1D-only formats", async () => {
    const { CameraScanner } = await import("@/components/scanner/camera-scanner");
    const { unmount } = render(<CameraScanner onScan={() => {}} onClose={() => {}} />);

    await screen.findByText("Point the camera at the product's barcode.");
    expect(camera.constructed).toHaveLength(1);
    const [elementId, config] = camera.constructed[0] as [string, { formatsToSupport: number[] }];
    expect(document.getElementById(elementId)).not.toBeNull();
    expect(config.formatsToSupport).toEqual([...BARCODE_FORMATS]);
    expect(config.formatsToSupport).not.toContain(Html5QrcodeSupportedFormats.QR_CODE);
    expect(camera.start).toHaveBeenCalledWith(
      { facingMode: "environment" },
      expect.objectContaining({ fps: 10 }),
      expect.any(Function),
      expect.any(Function),
    );

    unmount();
    await waitFor(() => expect(camera.stop).toHaveBeenCalled());
  });

  test("[FR-028] a decoded barcode is reported once and the camera stops", async () => {
    const onScan = vi.fn();
    const { CameraScanner } = await import("@/components/scanner/camera-scanner");
    render(<CameraScanner onScan={onScan} onClose={() => {}} />);
    await screen.findByText("Point the camera at the product's barcode.");

    const onDecoded = camera.start.mock.calls[0]?.[2] as (text: string) => void;
    onDecoded(" 4800016644290 ");
    onDecoded("4800016644290");
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("4800016644290");
    await waitFor(() => expect(camera.stop).toHaveBeenCalledTimes(1));
  });
});

describe("keyboard-wedge scanner detection", () => {
  function typeAt(buffer: WedgeBuffer, text: string, start: number, gap: number) {
    let time = start;
    const results: (string | null)[] = [];
    for (const key of [...text, "Enter"]) {
      results.push(buffer.push(key, time));
      time += gap;
    }
    return results.at(-1);
  }

  test("[FR-028] a fast burst ending in Enter is read as a barcode", () => {
    expect(typeAt(new WedgeBuffer(), "4800016644290", 1000, 8)).toBe("4800016644290");
  });

  test("[FR-028] normal typing speed is not mistaken for a scan", () => {
    expect(typeAt(new WedgeBuffer(), "4800016644290", 1000, 120)).toBeNull();
  });

  test("[FR-028] short bursts and slow starts are ignored; Shift doesn't break a burst", () => {
    const buffer = new WedgeBuffer();
    expect(typeAt(buffer, "abc", 0, 5)).toBeNull();
    // A person's slow key followed by a scan: only the scanned part is returned.
    buffer.push("x", 5_000);
    expect(typeAt(buffer, "SKU-123", 5_500, 5)).toBe("SKU-123");
    buffer.push("S", 9_000);
    buffer.push("Shift", 9_004);
    buffer.push("K", 9_008);
    buffer.push("U", 9_012);
    buffer.push("1", 9_016);
    expect(buffer.push("Enter", 9_020)).toBe("SKU1");
  });
});
