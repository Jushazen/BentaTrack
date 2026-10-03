// Zod input schemas: the owner's own password (FR-060, FR-046). Leaf 8.1.
import { z } from "zod";
import { passwordProblem } from "@/lib/auth";

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    /** FR-046: same rule as every other password (8–72 characters). */
    newPassword: z.string().superRefine((value, ctx) => {
      const problem = passwordProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
    confirmPassword: z.string(),
  })
  .superRefine(({ currentPassword, newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The two new passwords don't match.",
      });
    }
    if (currentPassword && newPassword === currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choose a password different from your current one.",
      });
    }
  });

export type ChangeOwnPasswordInput = z.input<typeof changeOwnPasswordSchema>;
