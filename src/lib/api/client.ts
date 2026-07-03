export async function readJsonResponse<T = unknown>(
  response: Response,
): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function readJsonResponseOrThrow<T = unknown>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const data = await readJsonResponse<T>(response);
  if (data === null) {
    throw new Error(fallbackMessage);
  }
  return data;
}

export async function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const data = await readJsonResponse<any>(response);
  const message =
    data?.error?.message || data?.error || data?.message || data?.details;

  return typeof message === "string" && message.trim()
    ? message
    : fallbackMessage;
}
