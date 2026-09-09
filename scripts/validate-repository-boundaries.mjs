/**
 * @author Avesd
 * @package Scripts
 * @namespace Root
 * @description Validate Repository Boundaries
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const violations = [];
const dependencySections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
];
const sourceExtensions = new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
]);
const nodeBuiltins = new Set(builtinModules.flatMap((name) => {

    return [
        name,
        `node:${name}`,
    ];
}));

const listDirectories = (parent) => {

    return readdirSync(parent)
        .map((name) => {

            return join(parent, name);
        })
        .filter((path) => {

            return statSync(path).isDirectory();
        });
};

const listSourceFiles = (root) => {

    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {

        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(path);
        }
        const extension = entry.name.slice(entry.name.lastIndexOf("."));

        return sourceExtensions.has(extension) ? [path] : [];
    });
};

const relativePath = (path) => {

    return path.slice(repositoryRoot.length + 1);
};

for (const directory of listDirectories(join(repositoryRoot, "packages"))) {
    const path = join(directory, "src/index.ts");
    if (!existsSync(path)) {
        continue;
    }
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest);
    if (source.statements.some((statement) => {

        return !ts.isExportDeclaration(statement) || !statement.moduleSpecifier;
    })) {
        violations.push(`${relativePath(path)}: package index must contain re-exports only`);
    }
}

const packageJsonPaths = [
    join(repositoryRoot, "package.json"),
    ...listDirectories(join(repositoryRoot, "apps")).map((path) => {

        return join(path, "package.json");
    }),
    ...listDirectories(join(repositoryRoot, "packages")).map((path) => {

        return join(path, "package.json");
    }),
];

for (const packageJsonPath of packageJsonPaths.slice(1)) {
    const directory = dirname(packageJsonPath);
    for (const subtree of [
        "src",
        "eslint",
        "vitest",
        "tests",
    ]) {
        const root = join(directory, subtree);
        if (!existsSync(root)) {
            continue;
        }
        for (const path of listSourceFiles(root)) {
            if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) || path.includes("/__tests__/")) {
                violations.push(`${relativePath(path)}: tests must live under the workspace test/ directory`);
            }
        }
    }
}

for (const packageJsonPath of packageJsonPaths) {
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    for (const section of dependencySections) {
        for (const [
            name,
            specifier,
        ] of Object.entries(manifest[section] ?? {})) {
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
    (specifier) => {

        return specifier === "electron" || nodeBuiltins.has(specifier);
    },
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
    (specifier) => {

        return publicContractRuntimeImports.has(specifier) || nodeBuiltins.has(specifier);
    },
    "plugin-api cannot depend on an implementation runtime",
);

validateImports(
    join(repositoryRoot, "packages/acp-client/src"),
    (specifier) => {

        return publicContractRuntimeImports.has(specifier) || nodeBuiltins.has(specifier);
    },
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
