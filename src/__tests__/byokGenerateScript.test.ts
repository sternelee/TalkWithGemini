import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function parseEnvOutput(output: string): Record<string, string> {
  return Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => {
        const rawValue = match[2];
        return [
          match[1],
          rawValue.startsWith('"') && rawValue.endsWith('"')
            ? rawValue.slice(1, -1)
            : rawValue,
        ];
      }),
  );
}

function deriveKeyIdFromPem(escapedPem: string): string {
  const privateKey = createPrivateKey(escapedPem.replace(/\\n/g, "\n"));
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ format: "der", type: "spki" });

  return createHash("sha256").update(spki).digest("base64url").slice(0, 32);
}

describe("BYOK key generation script", () => {
  it("is exposed through pnpm byok:generate and prints copyable env values", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    );

    expect(packageJson.scripts["byok:generate"]).toBe(
      "node scripts/generate-byok-key.mjs",
    );

    const output = execFileSync(
      process.execPath,
      ["scripts/generate-byok-key.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(output.trim().split("\n")).toHaveLength(3);
    const env = parseEnvOutput(output);

    expect(env.BYOK_PRIVATE_KEY_PEM).toMatch(
      /^-----BEGIN PRIVATE KEY-----\\n[A-Za-z0-9+/=\\n]+\\n-----END PRIVATE KEY-----$/,
    );
    expect(env.BYOK_KEY_ID).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(env.BYOK_KEY_ID).toBe(deriveKeyIdFromPem(env.BYOK_PRIVATE_KEY_PEM));
    expect(env.BYOK_ALLOW_EPHEMERAL_KEY).toBe("false");
  });
});
