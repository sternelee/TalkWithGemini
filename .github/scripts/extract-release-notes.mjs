import { readFileSync, writeFileSync } from "node:fs";

const [, , tag, changelogPath = "CHANGELOG.md", outputPath] = process.argv;

if (!tag || !outputPath) {
  console.error(
    "Usage: node .github/scripts/extract-release-notes.mjs <tag> <changelog> <output>",
  );
  process.exit(1);
}

const headingVersions = new Set([tag]);

if (tag.startsWith("v")) {
  headingVersions.add(tag.slice(1));
} else {
  headingVersions.add(`v${tag}`);
}

const lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);

const getVersionFromHeading = (line) => {
  const headingMatch = line.match(/^##\s+(.+?)\s*$/);

  if (!headingMatch) {
    return null;
  }

  const tokenMatch = headingMatch[1].trim().match(/^\[?([^\]\s]+)\]?/);

  return tokenMatch?.[1] ?? null;
};

const startIndex = lines.findIndex((line) =>
  headingVersions.has(getVersionFromHeading(line) ?? ""),
);

if (startIndex === -1) {
  console.error(
    `Could not find a ${changelogPath} section for tag "${tag}". Expected a level-2 heading like "## ${tag}".`,
  );
  process.exit(1);
}

let endIndex = lines.length;

for (let index = startIndex + 1; index < lines.length; index += 1) {
  if (/^##\s+/.test(lines[index])) {
    endIndex = index;
    break;
  }
}

const releaseNotes = lines.slice(startIndex + 1, endIndex);

while (releaseNotes.length > 0 && releaseNotes[0].trim() === "") {
  releaseNotes.shift();
}

while (
  releaseNotes.length > 0 &&
  releaseNotes[releaseNotes.length - 1].trim() === ""
) {
  releaseNotes.pop();
}

if (releaseNotes.length === 0) {
  console.error(`The ${changelogPath} section for "${tag}" is empty.`);
  process.exit(1);
}

writeFileSync(outputPath, `${releaseNotes.join("\n")}\n`);
