// Limits the offline app passes to forms. The server pages read them from modules the browser
// can't load (src/lib/storage.ts and src/lib/auth.ts need Node), so they are repeated here;
// tests/integration/offline-read checks they still match.
import type { ImageRules } from "@/features/products/product-form";

/** MAX_IMAGE_BYTES and ACCEPTED_IMAGE_TYPES of the product photo upload. */
export const OFFLINE_IMAGE_RULES: ImageRules = {
  maxBytes: 900 * 1024,
  acceptedTypes: "image/jpeg,image/png,image/webp",
};

/** PASSWORD_MIN_LENGTH (FR-046). */
export const OFFLINE_PASSWORD_MIN_LENGTH = 8;
