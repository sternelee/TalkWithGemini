import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";

const sourceRoot = resolve(process.cwd(), "src");
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".cts",
  ".cjs",
]);

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(filePath)));
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(filePath);
    }
  }

  return files;
}

function isStringLiteral(node) {
  return node && ts.isStringLiteral(node);
}

function collectModuleSpecifiers(sourceFile) {
  const specifiers = [];

  const addSpecifier = (node) => {
    if (isStringLiteral(node)) {
      specifiers.push({
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1,
        value: node.text,
      });
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (ts.isExternalModuleReference(reference)) {
        addSpecifier(reference.expression);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const expression = node.expression;
      const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequireCall =
        ts.isIdentifier(expression) && expression.text === "require";
      const isVitestModuleCall =
        ts.isPropertyAccessExpression(expression) &&
        (expression.name.text === "importActual" ||
          expression.name.text === "importMock");

      if (isDynamicImport || isRequireCall || isVitestModuleCall) {
        addSpecifier(node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function getLongRelativeImport(filePath, specifier) {
  const parentTraversal = specifier.match(/^(?:\.\.\/)+/u)?.[0] ?? "";
  const depth = (parentTraversal.match(/\.\.\//gu) ?? []).length;
  if (depth < 2) return null;

  const sourceRelativePath = relative(process.cwd(), filePath);
  const targetRelativePath = relative(
    process.cwd(),
    resolve(dirname(filePath), specifier),
  ).replaceAll("\\", "/");

  if (targetRelativePath !== "src" && !targetRelativePath.startsWith("src/")) {
    return null;
  }

  return {
    file: sourceRelativePath.replaceAll("\\", "/"),
    specifier,
  };
}

async function findViolations() {
  const violations = [];

  for (const filePath of await listSourceFiles(sourceRoot)) {
    const source = await readFile(filePath, "utf8");
    const extension = extname(filePath);
    const scriptKind =
      extension === ".tsx"
        ? ts.ScriptKind.TSX
        : extension === ".jsx"
          ? ts.ScriptKind.JSX
          : [".js", ".mjs", ".cjs"].includes(extension)
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      const violation = getLongRelativeImport(filePath, specifier.value);
      if (violation) {
        violations.push({ ...violation, line: specifier.line });
      }
    }
  }

  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

const violations = await findViolations();

if (violations.length > 0) {
  console.error(
    `Found ${violations.length} src-internal long relative import${
      violations.length === 1 ? "" : "s"
    }:
${violations
  .map(({ file, line, specifier }) => `- ${file}:${line} ${specifier}`)
  .join("\n")}`,
  );
  process.exit(1);
}

console.log("No src-internal long relative imports found.");
