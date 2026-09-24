"use client";

// Phone-camera barcode scanning (FR-028). Opens the back camera, reads one 1D barcode
// (scanner-config.ts; no QR codes, FR-029), then stops the camera and reports the code.
import { Camera, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "starting" | "scanning" | "error";

function cameraErrorMessage(err: unknown): string {
  const text = String(err instanceof Error ? `${err.name} ${err.message}` : err);
  if (/NotAllowed|Permission/i.test(text)) {
    return "Camera access was blocked. Allow the camera for this site in your browser settings.";
  }
  if (/NotFound|no camera|Requested device not found/i.test(text)) {
    return "No camera was found on this device.";
  }
  if (/secure|https/i.test(text)) return "The camera only works over a secure (https) connection.";
  return "The camera couldn't start. Close other apps using it and try again.";
}

/** The live camera view. Mount it to start scanning; unmounting stops the camera. */
export function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const regionId = `scanner-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState("");
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let running = false;

    async function stop() {
      if (!scanner || !running) return;
      running = false;
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // Already stopped.
      }
    }

    async function start() {
      try {
        const [{ Html5Qrcode }, config] = await Promise.all([
          import("html5-qrcode"),
          import("./scanner-config"),
        ]);
        if (cancelled) return;
        scanner = new Html5Qrcode(regionId, config.scannerConfig());
        await scanner.start(
          { facingMode: "environment" },
          config.cameraScanConfig(),
          (decodedText) => {
            if (!running) return;
            const code = decodedText.trim();
            if (!code) return;
            void stop();
            onScanRef.current(code);
          },
          () => {
            // Called for every frame without a barcode; nothing to do.
          },
        );
        running = true;
        if (cancelled) {
          await stop();
          return;
        }
        setStatus("scanning");
      } catch (err) {
        if (cancelled) return;
        setError(cameraErrorMessage(err));
        setStatus("error");
      }
    }

    void start();
    return () => {
      cancelled = true;
      void stop();
    };
  }, [regionId]);

  return (
    <div className="bg-surface space-y-3 rounded-lg p-4" aria-label="Barcode camera" role="region">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-text font-medium" aria-live="polite">
          {status === "starting" && "Starting the camera…"}
          {status === "scanning" && "Point the camera at the product's barcode."}
          {status === "error" && "Camera unavailable"}
        </p>
        <Button variant="ghost" icon={X} onClick={onClose}>
          Stop scanning
        </Button>
      </div>
      {status === "error" && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div id={regionId} className="mx-auto w-full max-w-md overflow-hidden rounded-lg" />
    </div>
  );
}

/** "Scan barcode" button that opens the camera view below it until a code is read. */
export function CameraScanButton({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <Button variant="secondary" icon={Camera} onClick={() => setOpen(true)}>
          Scan barcode
        </Button>
      )}
      {open && (
        <CameraScanner
          onClose={() => setOpen(false)}
          onScan={(code) => {
            setOpen(false);
            onScan(code);
          }}
        />
      )}
    </>
  );
}
