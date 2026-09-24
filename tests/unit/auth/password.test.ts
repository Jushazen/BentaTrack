import bcrypt from "bcryptjs";
import { expect, test } from "vitest";
import { PASSWORD_MIN_LENGTH, hashPassword, normalizeEmail, passwordProblem } from "@/lib/auth";

test("[FR-046] passwords must be at least 8 characters", async () => {
  expect(PASSWORD_MIN_LENGTH).toBe(8);
  expect(passwordProblem("1234567")).toMatch(/at least 8/);
  expect(passwordProblem("12345678")).toBeNull();
  expect(passwordProblem("x".repeat(73))).toMatch(/at most 72/);
  await expect(hashPassword("short")).rejects.toThrow(/at least 8/);
});

test("[FR-046] passwords are stored only as a bcrypt hash", async () => {
  const hash = await hashPassword("boutique-2026");
  expect(hash).not.toContain("boutique-2026");
  expect(hash).toMatch(/^\$2[aby]\$12\$/);
  expect(await bcrypt.compare("boutique-2026", hash)).toBe(true);
  expect(await bcrypt.compare("boutique-2027", hash)).toBe(false);
});

test("[FR-044] emails are compared without case or surrounding spaces", () => {
  expect(normalizeEmail("  Owner@Estetika.PH ")).toBe("owner@estetika.ph");
});
