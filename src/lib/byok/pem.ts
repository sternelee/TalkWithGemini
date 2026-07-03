import { base64UrlToBytes, bytesToBase64Url } from "./encoding";

export interface ParsedPkcs8RsaPrivateKey {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  spkiDer: Uint8Array;
}

interface DerElement {
  tag: number;
  value: Uint8Array;
}

class DerReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.byteLength;
  }

  read(expectedTag?: number): DerElement {
    if (this.offset >= this.bytes.byteLength) {
      throw new Error("Unexpected end of DER data");
    }

    const tag = this.bytes[this.offset];
    this.offset += 1;
    if (expectedTag !== undefined && tag !== expectedTag) {
      throw new Error("Unexpected DER tag");
    }

    const length = this.readLength();
    const end = this.offset + length;
    if (end > this.bytes.byteLength) {
      throw new Error("Invalid DER length");
    }

    const value = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return { tag, value };
  }

  private readLength(): number {
    const first = this.bytes[this.offset];
    this.offset += 1;

    if (first < 0x80) return first;

    const octets = first & 0x7f;
    if (octets === 0 || octets > 4) {
      throw new Error("Unsupported DER length");
    }
    if (this.offset + octets > this.bytes.byteLength) {
      throw new Error("Invalid DER length");
    }

    let length = 0;
    for (let index = 0; index < octets; index += 1) {
      length = (length << 8) | this.bytes[this.offset + index];
    }
    this.offset += octets;
    return length;
  }
}

const RSA_ENCRYPTION_OID = "2a864886f70d010101";

function cleanPem(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pemToDer(pem: string): Uint8Array {
  const normalized = cleanPem(pem);
  const match = normalized.match(
    /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/,
  );
  if (!match) {
    throw new Error("BYOK private key must be a PKCS#8 PEM private key");
  }

  return base64UrlToBytes(match[1].replace(/\s+/g, ""));
}

function trimUnsignedInteger(bytes: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset < bytes.byteLength - 1 && bytes[offset] === 0) {
    offset += 1;
  }
  return bytes.subarray(offset);
}

function readInteger(reader: DerReader): Uint8Array {
  return trimUnsignedInteger(reader.read(0x02).value);
}

function parsePkcs8PrivateKey(der: Uint8Array): Uint8Array {
  const info = new DerReader(new DerReader(der).read(0x30).value);
  readInteger(info);

  const algorithm = new DerReader(info.read(0x30).value);
  const oid = algorithm.read(0x06).value;
  if (bytesToHex(oid) !== RSA_ENCRYPTION_OID) {
    throw new Error("BYOK private key must use RSA");
  }

  return info.read(0x04).value;
}

function encodeLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function encodeDer(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes([
    new Uint8Array([tag]),
    encodeLength(value.byteLength),
    value,
  ]);
}

function encodeInteger(bytes: Uint8Array): Uint8Array {
  const normalized = trimUnsignedInteger(bytes);
  const needsSignPadding = normalized[0] >= 0x80;
  const value = needsSignPadding
    ? concatBytes([new Uint8Array([0]), normalized])
    : normalized;
  return encodeDer(0x02, value);
}

function createSpkiDer(
  modulus: Uint8Array,
  publicExponent: Uint8Array,
): Uint8Array {
  const oid = encodeDer(
    0x06,
    new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
  );
  const algorithm = encodeDer(
    0x30,
    concatBytes([oid, encodeDer(0x05, new Uint8Array())]),
  );
  const publicKey = encodeDer(
    0x30,
    concatBytes([encodeInteger(modulus), encodeInteger(publicExponent)]),
  );
  const bitString = encodeDer(
    0x03,
    concatBytes([new Uint8Array([0]), publicKey]),
  );
  return encodeDer(0x30, concatBytes([algorithm, bitString]));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function parsePkcs8RsaPrivateKeyPem(
  pem: string,
): ParsedPkcs8RsaPrivateKey {
  const rsa = new DerReader(parsePkcs8PrivateKey(pemToDer(pem)));
  const sequence = new DerReader(rsa.read(0x30).value);
  readInteger(sequence);

  const n = readInteger(sequence);
  const e = readInteger(sequence);
  const d = readInteger(sequence);
  const p = readInteger(sequence);
  const q = readInteger(sequence);
  const dp = readInteger(sequence);
  const dq = readInteger(sequence);
  const qi = readInteger(sequence);

  const publicKeyJwk: JsonWebKey = {
    kty: "RSA",
    n: bytesToBase64Url(n),
    e: bytesToBase64Url(e),
    alg: "RSA-OAEP-256",
    ext: true,
    key_ops: ["wrapKey"],
  };

  const privateKeyJwk: JsonWebKey = {
    ...publicKeyJwk,
    d: bytesToBase64Url(d),
    p: bytesToBase64Url(p),
    q: bytesToBase64Url(q),
    dp: bytesToBase64Url(dp),
    dq: bytesToBase64Url(dq),
    qi: bytesToBase64Url(qi),
    key_ops: ["unwrapKey"],
  };

  return {
    privateKeyJwk,
    publicKeyJwk,
    spkiDer: createSpkiDer(n, e),
  };
}

export async function getSpkiKeyId(spkiDer: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytesToArrayBuffer(spkiDer),
  );
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 32);
}
