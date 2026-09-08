/**
 * @author Avesd
 * @package Configuration
 * @namespace Root
 * @description ESLint Config
 */

import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import typescriptEslint from "typescript-eslint";

export const createAvesdConfig = (tsconfigRootDir = import.meta.dirname) => {
    return [
        {
            ignores: [
                "coverage/**",
                "dist/**",
                "node_modules/**",
                "out/**",
                "release/**",
            ],
        },
        {
            languageOptions: {
                parser: typescriptEslint.parser,
                parserOptions: {
                    sourceType: "module",
                },
            },
        },
        {
            plugins: {
                "@typescript-eslint": typescriptEslint.plugin,
                "@stylistic": stylistic,
                "simple-import-sort": simpleImportSort,
            },
            rules: {
                "arrow-body-style": [
                    "error",
                    "always",
                ],
                "curly": [
                    "error",
                    "all",
                ],
                "eqeqeq": [
                    "error",
                    "always",
                ],
                "no-var": "error",
                "object-shorthand": "error",
                "prefer-const": "error",
                "@typescript-eslint/consistent-type-imports": [
                    "error",
                    {
                        prefer: "type-imports",
                        fixStyle: "separate-type-imports",
                        disallowTypeAnnotations: false,
                    },
                ],
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-unused-vars": [
                    "error",
                    {
                        "argsIgnorePattern": "^_",
                    },
                ],
                "@stylistic/array-bracket-newline": [
                    "error",
                    {
                        minItems: 2,
                        multiline: true,
                    },
                ],
                "@stylistic/array-bracket-spacing": [
                    "error",
                    "never",
                ],
                "@stylistic/array-element-newline": [
                    "error",
                    {
                        minItems: 2,
                        multiline: true,
                    },
                ],
                "@stylistic/comma-spacing": [
                    "error",
                    {
                        before: false,
                        after: true,
                    },
                ],
                "@stylistic/comma-dangle": [
                    "error",
                    {
                        arrays: "always-multiline",
                        objects: "always-multiline",
                        functions: "always-multiline",
                        imports: "always-multiline",
                        exports: "always-multiline",
                        enums: "always-multiline",
                        generics: "always-multiline",
                        tuples: "always-multiline",
                    },
                ],
                "@stylistic/curly-newline": [
                    "error",
                    {
                        multiline: true,
                        consistent: true,
                        IfStatementConsequent: "always",
                        IfStatementAlternative: "always",
                        ArrowFunctionExpression: "always",
                    },
                ],
                "@stylistic/function-call-argument-newline": [
                    "error",
                    "consistent",
                ],
                "@stylistic/function-paren-newline": [
                    "error",
                    "multiline",
                ],
                "@stylistic/indent": [
                    "error",
                    4,
                    {
                        SwitchCase: 1,
                    },
                ],
                "@stylistic/key-spacing": [
                    "error",
                    {
                        beforeColon: false,
                        afterColon: true,
                        mode: "strict",
                    },
                ],
                "@stylistic/lines-around-comment": [
                    "error",
                    {
                        beforeBlockComment: false,
                        afterBlockComment: true,
                        beforeLineComment: false,
                        afterLineComment: false,
                        ignorePattern: "^(?![\\s\\S]*@author\\s+Avesd\\b)",
                    },
                ],
                "@stylistic/member-delimiter-style": [
                    "error",
                    {
                        multiline: {
                            delimiter: "semi",
                            requireLast: true,
                        },
                        singleline: {
                            delimiter: "semi",
                            requireLast: true,
                        },
                    },
                ],
                "@stylistic/newline-per-chained-call": [
                    "error",
                    {
                        ignoreChainWithDepth: 2,
                    },
                ],
                "@stylistic/no-multiple-empty-lines": [
                    "error",
                    {
                        max: 1,
                        maxBOF: 0,
                        maxEOF: 1,
                    },
                ],
                "@stylistic/no-trailing-spaces": "error",
                "@stylistic/object-curly-newline": [
                    "error",
                    {
                        ObjectExpression: {
                            minProperties: 3,
                            multiline: true,
                            consistent: true,
                        },
                        ImportDeclaration: "never",
                        TSTypeLiteral: "always",
                        TSInterfaceBody: "always",
                    },
                ],
                "@stylistic/object-curly-spacing": [
                    "error",
                    "always",
                    {
                        emptyObjects: "never",
                    },
                ],
                "@stylistic/object-property-newline": "error",
                "@stylistic/padding-line-between-statements": [
                    "error",
                    {
                        blankLine: "always",
                        prev: "*",
                        next: "import",
                    },
                    {
                        blankLine: "always",
                        prev: "import",
                        next: "*",
                    },
                    {
                        blankLine: "any",
                        prev: "import",
                        next: "import",
                    },
                ],
                "simple-import-sort/imports": [
                    "error",
                    {
                        groups: [
                            [
                                "^\\u0000",
                                "^",
                            ],
                        ],
                    },
                ],
                "simple-import-sort/exports": "error",
                "@stylistic/quotes": [
                    "error",
                    "double",
                    {
                        avoidEscape: true,
                    },
                ],
                "@stylistic/semi": [
                    "error",
                    "always",
                ],
                "@stylistic/space-in-parens": [
                    "error",
                    "never",
                ],
                "@stylistic/type-annotation-spacing": "error",
                "@stylistic/type-generic-spacing": "error",
                "@stylistic/type-named-tuple-spacing": "error",
            },
        },
        {
            files: ["**/*.tsx"],
            rules: {
                "@stylistic/jsx-closing-bracket-location": [
                    "error",
                    "line-aligned",
                ],
                "@stylistic/jsx-first-prop-new-line": [
                    "error",
                    "always",
                ],
                "@stylistic/jsx-max-props-per-line": [
                    "error",
                    {
                        maximum: {
                            single: 1,
                            multi: 1,
                        },
                    },
                ],
                "@stylistic/jsx-one-expression-per-line": [
                    "error",
                    {
                        allow: "literal",
                    },
                ],
            },
        },
        {
            files: ["**/*.{ts,tsx}"],
            ignores: [
                "**/*.d.ts",
                "**/test/**",
            ],
            languageOptions: {
                parserOptions: {
                    projectService: {
                        allowDefaultProject: ["vitest.config.ts"],
                    },
                    tsconfigRootDir,
                },
            },
            rules: {
                "@typescript-eslint/await-thenable": "error",
                "@typescript-eslint/consistent-type-exports": "error",
                "@typescript-eslint/no-base-to-string": "error",
                "@typescript-eslint/no-confusing-void-expression": [
                    "error",
                    {
                        ignoreVoidOperator: true,
                    },
                ],
                "@typescript-eslint/no-deprecated": "error",
                "@typescript-eslint/no-floating-promises": "error",
                "@typescript-eslint/no-misused-promises": "error",
                "@typescript-eslint/no-unnecessary-condition": [
                    "error",
                    {
                        allowConstantLoopConditions: "only-allowed-literals",
                    },
                ],
                "@typescript-eslint/no-unnecessary-type-assertion": "error",
                "@typescript-eslint/no-unsafe-enum-comparison": "error",
                "@typescript-eslint/only-throw-error": "error",
                "@typescript-eslint/switch-exhaustiveness-check": "error",
            },
        },
    ];
};

export default createAvesdConfig();
