"use client";

// "Install app" (FR-061, amendment H3). Where the browser can install (Android, desktop Chrome
// and Edge) it opens the browser's prompt; on iPhone and iPad it shows Safari's Add to Home
// Screen steps. Renders nothing once the app runs installed, or where neither applies.
import { Compass, Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getInstallMode,
  getServerInstallMode,
  promptInstall,
  subscribeInstall,
} from "./install-store";

function IosSteps({
  open,
  onClose,
  inSafari,
}: {
  open: boolean;
  onClose: () => void;
  inSafari: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const iconClass = "text-muted mt-0.5 size-5 shrink-0";
  return (
    <dialog
      ref={ref}
      aria-labelledby="install-steps-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="bg-surface text-text m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 id="install-steps-title" className="text-lg font-medium">
          Install BentaTrack on this device
        </h2>
        <ol className="space-y-3 text-[15px]">
          {!inSafari && (
            <li className="flex gap-3">
              <Compass aria-hidden className={iconClass} strokeWidth={1.75} />
              <span>
                Open this page in <strong>Safari</strong>. iPhone and iPad install apps only from
                Safari.
              </span>
            </li>
          )}
          <li className="flex gap-3">
            <Share aria-hidden className={iconClass} strokeWidth={1.75} />
            <span>
              Tap the <strong>Share</strong> button in Safari&apos;s toolbar (at the bottom on
              iPhone, at the top on iPad).
            </span>
          </li>
          <li className="flex gap-3">
            <SquarePlus aria-hidden className={iconClass} strokeWidth={1.75} />
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>
              .
            </span>
          </li>
        </ol>
        <p className="text-muted text-sm">
          BentaTrack then opens from its own icon on your home screen, without Safari&apos;s address
          bar.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-text hover:bg-secondary flex min-h-11 items-center gap-2 rounded-lg px-3"
          >
            <X aria-hidden className="size-5" strokeWidth={1.75} />
            <span>Close</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function InstallAppButton({ className = "" }: { className?: string }) {
  const mode = useSyncExternalStore(subscribeInstall, getInstallMode, getServerInstallMode);
  const [stepsOpen, setStepsOpen] = useState(false);
  if (mode === "hidden") return null;

  const ios = mode === "ios-safari" || mode === "ios-other";
  return (
    <>
      <button
        type="button"
        onClick={() => (ios ? setStepsOpen(true) : void promptInstall())}
        aria-haspopup={ios ? "dialog" : undefined}
        className={`text-text hover:bg-secondary flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left ${className}`}
      >
        <Download aria-hidden className="text-muted size-5 shrink-0" strokeWidth={1.75} />
        <span>Install app</span>
      </button>
      {ios && (
        <IosSteps
          open={stepsOpen}
          onClose={() => setStepsOpen(false)}
          inSafari={mode === "ios-safari"}
        />
      )}
    </>
  );
}
