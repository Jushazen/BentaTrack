// Product photo rules (FR-002), in a module the browser can load too: the product schemas check
// photos on the device before a change is queued offline (leaf 9.4). src/lib/storage.ts, which
// needs Node, re-exports these.

/** Server actions accept at most 1 MB per request; leave room for the other form fields. */
export const MAX_IMAGE_BYTES = 900 * 1024;

export const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageType = keyof typeof IMAGE_EXTENSIONS;

export function isImageType(type: string): type is ImageType {
  return Object.hasOwn(IMAGE_EXTENSIONS, type);
}
