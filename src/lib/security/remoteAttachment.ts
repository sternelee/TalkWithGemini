import { getSafeUrlPolicy, validateOutboundUrl } from "./urlPolicy";

export function getRemoteAttachmentUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Remote file URL is required";

  try {
    validateOutboundUrl(trimmed, {
      ...getSafeUrlPolicy("image"),
      allowedProtocols: ["https:"],
    });
    return null;
  } catch (error) {
    if (error instanceof Error) {
      if (/Protocol/i.test(error.message)) {
        return "Only HTTPS file URLs are supported.";
      }
      if (/credentials/i.test(error.message)) {
        return "Remove embedded credentials from the URL.";
      }
      return error.message;
    }
    return "Invalid remote file URL.";
  }
}
