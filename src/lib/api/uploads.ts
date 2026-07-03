interface UploadBlobValidationOptions {
  label: string;
  maxBytes: number;
}

export function getUploadBlobValidationError(
  value: unknown,
  options: UploadBlobValidationOptions,
): string | null {
  if (!(value instanceof Blob)) {
    return `${options.label} is required`;
  }

  if (value.size === 0) {
    return `${options.label} is empty`;
  }

  if (value.size > options.maxBytes) {
    return `${options.label} is too large`;
  }

  return null;
}
