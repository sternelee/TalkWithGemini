import "server-only";

import { redactSensitiveText } from "../errors";

function sanitizeLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (!value || typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
    };
  }

  if (value instanceof Headers) {
    return sanitizeLogValue(Object.fromEntries(value.entries()), seen);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/key|token|secret|auth|password|ciphertext|wrappedKey|iv/i.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = sanitizeLogValue(item, seen);
    }
  }

  return result;
}

export function safeServerLogError(
  message: string,
  ...values: unknown[]
): void {
  if (process.env.NODE_ENV === "test") return;
  console.error(message, ...values.map((value) => sanitizeLogValue(value)));
}

export function safeServerLogWarn(message: string, ...values: unknown[]): void {
  if (process.env.NODE_ENV === "test") return;
  console.warn(message, ...values.map((value) => sanitizeLogValue(value)));
}
