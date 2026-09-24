// The shape every server action returns. Actions never throw to the client.

export type ErrorCode =
  "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "OFFLINE";

export type ActionError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Result<never> {
  return { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } };
}
