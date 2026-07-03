type WavOptions = {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
};

function getNodeBuffer(): typeof Buffer | undefined {
  return typeof Buffer !== "undefined" ? Buffer : undefined;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const NodeBuffer = getNodeBuffer();
  if (NodeBuffer) return NodeBuffer.from(bytes).toString("base64");

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const NodeBuffer = getNodeBuffer();
  if (NodeBuffer) return new Uint8Array(NodeBuffer.from(value, "base64"));

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

export function createPcmWavBytes(
  pcmBytes: Uint8Array,
  { sampleRate = 24000, channels = 1, bitsPerSample = 16 }: WavOptions = {},
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const wavBytes = new Uint8Array(44 + pcmBytes.byteLength);
  const view = new DataView(
    wavBytes.buffer,
    wavBytes.byteOffset,
    wavBytes.byteLength,
  );

  writeAscii(wavBytes, 0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeAscii(wavBytes, 8, "WAVE");
  writeAscii(wavBytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(wavBytes, 36, "data");
  view.setUint32(40, pcmBytes.byteLength, true);
  wavBytes.set(pcmBytes, 44);

  return wavBytes;
}
