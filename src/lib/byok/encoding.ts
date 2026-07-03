function getNodeBuffer(): typeof Buffer | undefined {
  return typeof Buffer !== "undefined" ? Buffer : undefined;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  const NodeBuffer = getNodeBuffer();
  let base64: string;

  if (NodeBuffer) {
    base64 = NodeBuffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = `${padded}${"=".repeat(padLength)}`;
  const NodeBuffer = getNodeBuffer();

  if (NodeBuffer) {
    return new Uint8Array(NodeBuffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function arrayBufferToBytes(value: ArrayBuffer): Uint8Array {
  return new Uint8Array(value);
}
