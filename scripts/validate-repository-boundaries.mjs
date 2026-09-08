/**
 * @author Avesd
 * @package Scripts
 * @namespace Root
 * @description Validate Repository Boundaries
 */

import { builtinModules } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const violations = [];
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

const listDirectories = (parent) => readdirSync(parent)
  .map((name) => join(parent, name))
  .filter((path) => statSync(path).isDirectory());

const listSourceFiles = (root) => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = join(root, entry.name);
  if (entry.isDirectory()) {
    return listSourceFiles(path);
  }
  const extension = entry.name.slice(entry.name.lastIndexOf("."));
  return sourceExtensions.has(extension) ? [path] : [];
});

const relativePath = (path) => path.slice(repositoryRoot.length + 1);

const packageJsonPaths = [
  join(repositoryRoot, "package.json"),
  ...listDirectories(join(repositoryRoot, "apps")).map((path) => join(path, "package.json")),
  ...listDirectories(join(repositoryRoot, "packages")).map((path) => join(path, "package.json")),
];

for (const packageJsonPath of packageJsonPaths) {
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  for (const section of dependencySections) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      const expectedPrefix = name.startsWith("@avesd/") ? "workspace:" : "catalog:";
      if (typeof specifier !== "string" || !specifier.startsWith(expectedPrefix)) {
        violations.push(`${relativePath(packageJsonPath)}: ${section}.${name} must use ${expectedPrefix}`);
      }
    }
  }
}

const extractImports = (source) => {
  const specifiers = [];
  const patterns = [
    /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
};

const validateImports = (root, isForbidden, description) => {
  for (const path of listSourceFiles(root)) {
    const source = readFileSync(path, "utf8");
    for (const specifier of extractImports(source)) {
      if (isForbidden(specifier)) {
        violations.push(`${relativePath(path)}: ${description}: ${specifier}`);
      }
    }
  }
};

validateImports(
  join(repositoryRoot, "apps/desktop/src/renderer"),
  (specifier) => specifier === "electron" || nodeBuiltins.has(specifier),
  "renderer cannot import privileged runtime module",
);

const publicContractRuntimeImports = new Set([
  "@avesd/kernel",
  "cordis",
  "electron",
  "react",
  "react-dom",
]);

validateImports(
  join(repositoryRoot, "packages/plugin-api/src"),
  (specifier) => publicContractRuntimeImports.has(specifier) || nodeBuiltins.has(specifier),
  "plugin-api cannot depend on an implementation runtime",
);

validateImports(
  join(repositoryRoot, "packages/acp-client/src"),
  (specifier) => publicContractRuntimeImports.has(specifier) || nodeBuiltins.has(specifier),
  "acp-client must remain provider and runtime neutral",
);

if (violations.length > 0) {
  for (const violation of violations.sort()) {
    console.error(violation);
  }
  process.exitCode = 1;
} else {
  console.log("Repository boundary validation passed");
}
