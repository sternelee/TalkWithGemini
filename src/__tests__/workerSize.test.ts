import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const MIB = 1024 * 1024;

function runWorkerSizeCheck(output: string, budgetBytes?: number) {
  const directory = mkdtempSync(join(tmpdir(), "neo-worker-size-"));
  const wranglerPath = join(directory, "wrangler");
  const argsPath = join(directory, "args.txt");

  writeFileSync(
    wranglerPath,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
writeFileSync(process.env.WRANGLER_ARGS_FILE, process.argv.slice(2).join(" "));
process.stdout.write(process.env.WRANGLER_TEST_OUTPUT || "");
`,
  );
  chmodSync(wranglerPath, 0o755);

  try {
    const result = spawnSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/check-worker-size.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH || ""}`,
          WRANGLER_ARGS_FILE: argsPath,
          WRANGLER_TEST_OUTPUT: output,
          ...(budgetBytes === undefined
            ? {}
            : { WORKER_GZIP_BUDGET_BYTES: String(budgetBytes) }),
        },
      },
    );

    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      args: existsSync(argsPath) ? readFileSync(argsPath, "utf8") : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Worker upload size gate", () => {
  it("uses Wrangler gzip output with injectable 1 MiB and 3 MiB budgets", () => {
    const dryRunOutput = "Total Upload: 4.00 MiB / gzip: 2.00 MiB\n";

    const oneMiB = runWorkerSizeCheck(dryRunOutput, MIB);
    const threeMiB = runWorkerSizeCheck(dryRunOutput, 3 * MIB);

    expect(oneMiB.status).toBe(1);
    expect(oneMiB.output).toContain("exceeds budget 1.00 MiB");
    expect(threeMiB.status).toBe(0);
    expect(threeMiB.output).toContain("within budget 3.00 MiB");
    expect(threeMiB.args).toBe("deploy --dry-run --config wrangler.jsonc");
  });

  it("defaults to a 3 MiB gzip budget", () => {
    const result = runWorkerSizeCheck(
      "Total Upload: 4.00 MiB / gzip: 2.50 MiB\n",
    );

    expect(result.status).toBe(0);
    expect(result.output).toContain("within budget 3.00 MiB");
  });

  it("fails when Wrangler output does not contain Total Upload gzip size", () => {
    const result = runWorkerSizeCheck("Dry run completed without size data\n");

    expect(result.status).toBe(1);
    expect(result.output).toContain("Could not parse Wrangler dry-run output");
  });
});
