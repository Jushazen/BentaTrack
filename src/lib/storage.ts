// Product image storage (D2). Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise local
// disk under .uploads/products/ (dev and tests only), served to signed-in users by
// src/app/(app)/products/images/[file]/route.ts. Not public/: `next start` only serves files
// that were in public/ when it started (PLAN amendment, leaf 3.2).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

/** Server actions accept at most 1 MB per request; leave room for the other form fields. */
export const MAX_IMAGE_BYTES = 900 * 1024;

export const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageType = keyof typeof IMAGE_EXTENSIONS;

export const LOCAL_IMAGE_PATH = "/products/images/";

const LOCAL_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const CONTENT_TYPE_BY_EXTENSION: Record<string, ImageType> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A problem the user can fix (wrong file) or the owner must fix (storage not configured). */
export class ImageStorageError extends Error {}

export function isImageType(type: string): type is ImageType {
  return Object.hasOwn(IMAGE_EXTENSIONS, type);
}

/** Identifies JPEG, PNG, or WebP from the file's first bytes, whatever its name or stated type. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function localUploadDir(): string {
  return path.join(process.cwd(), ".uploads", "products");
}

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Saves a product photo and returns the URL to store on the product. */
export async function storeProductImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageStorageError("That photo is too large. Use one under 900 KB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw new ImageStorageError("That file isn't a JPEG, PNG, or WebP photo.");
  const name = `${randomUUID()}.${IMAGE_EXTENSIONS[type]}`;

  if (blobConfigured()) {
    const blob = await put(`products/${name}`, Buffer.from(bytes), {
      access: "public",
      contentType: type,
    });
    return blob.url;
  }
  // Vercel's filesystem is read-only, so production needs Blob.
  if (process.env.VERCEL) {
    throw new ImageStorageError("Photo storage isn't set up yet. Save without a photo for now.");
  }
  const dir = localUploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `${LOCAL_IMAGE_PATH}${name}`;
}

/** Best effort: a leftover file is harmless, so failures are logged, never thrown. */
export async function deleteProductImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    if (url.startsWith(LOCAL_IMAGE_PATH)) {
      const name = url.slice(LOCAL_IMAGE_PATH.length);
      if (LOCAL_FILE_NAME.test(name)) await unlink(path.join(localUploadDir(), name));
    } else if (blobConfigured() && url.startsWith("https://")) {
      await del(url);
    }
  } catch (err) {
    console.error("couldn't delete product image", err);
  }
}

/** Reads a locally stored photo by file name; null for unknown or malformed names. */
export async function readLocalProductImage(
  name: string,
): Promise<{ bytes: Uint8Array; contentType: ImageType } | null> {
  if (!LOCAL_FILE_NAME.test(name)) return null;
  try {
    const bytes = await readFile(path.join(localUploadDir(), name));
    return { bytes, contentType: CONTENT_TYPE_BY_EXTENSION[name.split(".").pop() ?? ""] };
  } catch {
    return null;
  }
}
