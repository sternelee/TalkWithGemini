import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToBase64Url } from "../lib/byok/encoding";
import { getSpkiKeyId, parsePkcs8RsaPrivateKeyPem } from "../lib/byok/pem";

describe("BYOK PKCS#8 PEM parsing", () => {
  it("extracts RSA JWK material and preserves the existing SPKI key id", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicExponent: 0x10001,
    });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const spki = new Uint8Array(
      createPublicKey(pem).export({
        format: "der",
        type: "spki",
      }),
    );
    const expectedKeyId = bytesToBase64Url(
      createHash("sha256").update(spki).digest(),
    ).slice(0, 32);

    const parsed = parsePkcs8RsaPrivateKeyPem(pem);

    expect(parsed.publicKeyJwk).toMatchObject({
      kty: "RSA",
      e: "AQAB",
      alg: "RSA-OAEP-256",
      ext: true,
      key_ops: ["wrapKey"],
    });
    expect(parsed.privateKeyJwk).toMatchObject({
      kty: "RSA",
      e: "AQAB",
      alg: "RSA-OAEP-256",
      ext: true,
      key_ops: ["unwrapKey"],
    });
    expect(parsed.publicKeyJwk.n).toBeTruthy();
    expect(parsed.privateKeyJwk.d).toBeTruthy();
    await expect(getSpkiKeyId(parsed.spkiDer)).resolves.toBe(expectedKeyId);
    expect(Array.from(parsed.spkiDer)).toEqual(Array.from(spki));
  });

  it("accepts escaped newlines from environment variables", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicExponent: 0x10001,
    });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    expect(() =>
      parsePkcs8RsaPrivateKeyPem(pem.replace(/\n/g, "\\n")),
    ).not.toThrow();
  });
});
