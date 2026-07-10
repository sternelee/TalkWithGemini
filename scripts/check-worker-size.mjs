import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const budgetBytes = Number.parseInt(
  process.env.WORKER_GZIP_BUDGET_BYTES || "",
  10,
);
const maxGzipBytes = Number.isFinite(budgetBytes)
  ? budgetBytes
  : 3 * 1024 * 1024;

const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

function sizeToBytes(value, unit) {
  const multipliers = {
    B: 1,
    KIB: 1024,
    MIB: 1024 * 1024,
    GIB: 1024 * 1024 * 1024,
  };
  return Number.parseFloat(value.replaceAll(",", "")) * multipliers[unit];
}

function parseWranglerDryRunOutput(output) {
  const match = output.match(
    /Total Upload:\s*([\d,.]+)\s*(B|KiB|MiB|GiB)\s*\/\s*gzip:\s*([\d,.]+)\s*(B|KiB|MiB|GiB)/i,
  );
  if (!match) {
    throw new Error("Could not parse Wrangler dry-run output");
  }

  return {
    totalUploadBytes: sizeToBytes(match[1], match[2].toUpperCase()),
    gzipBytes: sizeToBytes(match[3], match[4].toUpperCase()),
  };
}

try {
  const wranglerCommand =
    process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  const { stdout, stderr } = await execFileAsync(
    wranglerCommand,
    ["deploy", "--dry-run", "--config", "wrangler.jsonc"],
    {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const { gzipBytes } = parseWranglerDryRunOutput(`${stdout}\n${stderr}`);

  if (gzipBytes > maxGzipBytes) {
    console.error(
      `Wrangler gzip size ${formatBytes(
        gzipBytes,
      )} exceeds budget ${formatBytes(maxGzipBytes)}.`,
    );
    process.exit(1);
  }

  console.log(
    `Wrangler gzip size ${formatBytes(gzipBytes)} within budget ${formatBytes(
      maxGzipBytes,
    )}.`,
  );
} catch (error) {
  console.error(
    `Could not check Worker size. ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
