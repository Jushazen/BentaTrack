// Camera scanner settings (FR-028, FR-029). Only 1D retail barcodes are decoded: QR codes and
// other 2D codes are left out on purpose (FR-029), which also makes decoding faster.
// Loaded together with html5-qrcode only when the camera opens, so the library stays out of the
// main bundle.
import {
  Html5QrcodeSupportedFormats,
  type Html5QrcodeCameraScanConfig,
  type Html5QrcodeFullConfig,
} from "html5-qrcode";

export const BARCODE_FORMATS: readonly Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

export function scannerConfig(): Html5QrcodeFullConfig {
  return {
    formatsToSupport: [...BARCODE_FORMATS],
    // Uses the phone's built-in barcode detector (Android Chrome) when it has one.
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false,
  };
}

/** A wide, short scan box suits 1D barcodes. */
export function cameraScanConfig(): Html5QrcodeCameraScanConfig {
  return {
    fps: 10,
    qrbox: (width, height) => ({
      width: Math.round(Math.min(width * 0.9, 400)),
      height: Math.round(Math.min(height * 0.5, 160)),
    }),
  };
}
