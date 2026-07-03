import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  createPcmWavBytes,
} from "../lib/utils/binary";

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, true);
}

describe("portable binary helpers", () => {
  it("roundtrips standard base64 without requiring Buffer", () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    const encoded = bytesToBase64(bytes);

    expect(encoded).toBe("AAH+/w==");
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("creates a PCM WAV byte array with a valid RIFF header", () => {
    const pcm = new Uint8Array([1, 0, 255, 127]);
    const wav = createPcmWavBytes(pcm, {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
    });

    expect(readAscii(wav, 0, 4)).toBe("RIFF");
    expect(readUint32LE(wav, 4)).toBe(36 + pcm.byteLength);
    expect(readAscii(wav, 8, 12)).toBe("WAVE");
    expect(readAscii(wav, 12, 16)).toBe("fmt ");
    expect(readUint32LE(wav, 24)).toBe(24000);
    expect(readUint32LE(wav, 40)).toBe(pcm.byteLength);
    expect(Array.from(wav.slice(44))).toEqual(Array.from(pcm));
  });
});
