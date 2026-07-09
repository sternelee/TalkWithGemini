import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const workerPath = new URL("../.open-next/worker.js", import.meta.url);
const budgetBytes = Number.parseInt(
  process.env.WORKER_GZIP_BUDGET_BYTES || "",
  10,
);
const maxGzipBytes = Number.isFinite(budgetBytes)
  ? budgetBytes
  : 3 * 1024 * 1024;

const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

try {
  const worker = await readFile(workerPath);
  const gzipBytes = gzipSync(worker).byteLength;
  if (gzipBytes > maxGzipBytes) {
    console.error(
      `Worker gzip size ${formatBytes(gzipBytes)} exceeds budget ${formatBytes(
        maxGzipBytes,
      )}.`,
    );
    process.exit(1);
  }
  console.log(
    `Worker gzip size ${formatBytes(gzipBytes)} within budget ${formatBytes(
      maxGzipBytes,
    )}.`,
  );
} catch (error) {
  console.error(
    `Could not check Worker size. Run pnpm build:worker first. ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
