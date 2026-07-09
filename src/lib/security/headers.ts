import { createHash } from "node:crypto";
import type { DeploymentMode } from "./deployment";
import { getDeploymentMode } from "./deployment";
import { THEME_INIT_SCRIPT } from "../themeInitScript";

export interface SecurityHeader {
  key: string;
  value: string;
}

function buildCsp(mode: DeploymentMode): string {
  const isHosted = mode === "hosted";
  const themeScriptHash = createHash("sha256")
    .update(THEME_INIT_SCRIPT)
    .digest("base64");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    isHosted
      ? `script-src 'self' 'sha256-${themeScriptHash}'`
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${isHosted ? "" : " http:"}`,
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https: blob:${isHosted ? "" : " http:"}`,
    "frame-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function getSecurityHeaders(
  mode: DeploymentMode = getDeploymentMode(),
): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildCsp(mode),
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), serial=()",
    },
  ];
}
