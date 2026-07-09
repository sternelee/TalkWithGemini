import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../public", import.meta.url).pathname;
const blockedNames = new Set([".DS_Store"]);
const findings = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (blockedNames.has(entry.name)) {
      findings.push(relative(process.cwd(), path));
    }
    if (entry.isDirectory()) {
      await walk(path);
    }
  }
}

await walk(root);

if (findings.length > 0) {
  console.error(
    `Blocked generated artifacts found in public assets:\n${findings
      .map((item) => `- ${item}`)
      .join("\n")}`,
  );
  process.exit(1);
}

console.log("No blocked generated artifacts found in public assets.");
