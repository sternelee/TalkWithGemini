import { getSafeUrlPolicy, validateOutboundUrl } from "./urlPolicy";

export function getRemoteAttachmentUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Remote file URL is required";

  try {
    validateOutboundUrl(trimmed, getSafeUrlPolicy("plugin"));
    return null;
  } catch (error) {
    if (error instanceof Error) {
      if (/Protocol|Plain HTTP/i.test(error.message)) {
        return "Only HTTPS file URLs are supported.";
      }
      if (/credentials/i.test(error.message)) {
        return "Remove embedded credentials from the URL.";
      }
      if (/Localhost|Private network/i.test(error.message)) {
        return "Localhost and private network file URLs are blocked.";
      }
      return error.message;
    }
    return "Invalid remote file URL.";
  }
}
