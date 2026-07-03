#!/usr/bin/env node

import { createHash, generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicExponent: 0x10001,
});

const privateKeyPem = privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString()
  .trim()
  .replace(/\n/g, "\\n");
const publicKeySpki = publicKey.export({ format: "der", type: "spki" });
const keyId = createHash("sha256")
  .update(publicKeySpki)
  .digest("base64url")
  .slice(0, 32);

console.log(`BYOK_PRIVATE_KEY_PEM="${privateKeyPem}"`);
console.log(`BYOK_KEY_ID=${keyId}`);
console.log("BYOK_ALLOW_EPHEMERAL_KEY=false");
