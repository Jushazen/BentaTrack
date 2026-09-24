// Product photo, or a neutral placeholder when there is none. `unoptimized` because photos come
// from Vercel Blob or the local image route and are already resized before upload.
import { Package } from "lucide-react";
import Image from "next/image";

export function ProductImage({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: "thumb" | "large";
}) {
  const box = size === "thumb" ? "size-14 rounded-md" : "aspect-square w-full rounded-lg";
  if (!url) {
    return (
      <div
        className={`bg-secondary text-muted flex shrink-0 items-center justify-center ${box}`}
        aria-hidden={size === "thumb" || undefined}
      >
        <Package
          aria-hidden
          className={size === "thumb" ? "size-6" : "size-12"}
          strokeWidth={1.5}
        />
        {size === "large" && <span className="sr-only">No photo</span>}
      </div>
    );
  }
  return (
    <div className={`bg-secondary relative shrink-0 overflow-hidden ${box}`}>
      <Image
        src={url}
        alt={size === "thumb" ? "" : `Photo of ${name}`}
        fill
        unoptimized
        sizes={size === "thumb" ? "56px" : "(min-width: 768px) 320px, 100vw"}
        className="object-cover"
      />
    </div>
  );
}
