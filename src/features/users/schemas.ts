// Zod input schemas: User account management (FR-044–046). Leaf 2.3.
import { z } from "zod";
import { passwordProblem } from "@/lib/auth";

/** FR-046: same rule as login (8–72 characters; bcrypt's limit is 72). */
const password = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

/** FR-044: stored lowercase, so "Staff@Estetika.ph" and "staff@estetika.ph" are one account. */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }).max(254));

const userId = z.string().min(1, "Missing account.");

export const createStaffUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80, "Name is too long."),
  email,
  password,
});

export const resetPasswordSchema = z.object({ userId, password });

export const setUserActiveSchema = z.object({ userId, active: z.boolean() });

export type CreateStaffUserInput = z.input<typeof createStaffUserSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type SetUserActiveInput = z.input<typeof setUserActiveSchema>;
