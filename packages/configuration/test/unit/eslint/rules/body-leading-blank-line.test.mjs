/**
 * @author Avesd
 * @package Configuration
 * @namespace TestUnitEslintRules
 * @description Body Leading Blank Line Tests
 */

import { bodyLeadingBlankLine } from "../../../../eslint/rules/body-leading-blank-line.mjs";
import { ESLint, Linter } from "eslint";
import assert from "node:assert/strict";
import test from "node:test";
import typescriptEslint from "typescript-eslint";

const linter = new Linter();
const config = [
    {
        languageOptions: { parser: typescriptEslint.parser },
        plugins: { avesd: { rules: { "body-leading-blank-line": bodyLeadingBlankLine } } },
        rules: { "avesd/body-leading-blank-line": "error" },
    },
];

test("pads functions, methods, constructors, generators, and enums", () => {

    const inputs = [
        "function example() {\nreturn 1;\n}",
        "const example = function () {\nreturn 1;\n};",
        "const example = () => {\nreturn 1;\n};",
        "class Example { method() {\nreturn 1;\n} }",
        "class Example { constructor() {\nthis.value = 1;\n} }",
        "function* example() {\nyield 1;\n}",
        "enum Example {\nValue\n}",
    ];
    for (const input of inputs) {
        const result = linter.verifyAndFix(input, config);
        assert.equal(result.fixed, true);
        assert.deepEqual(result.messages, []);
        assert.equal(result.output, input.replace("{\n", "{\n\n"));
        assert.equal(linter.verifyAndFix(result.output, config).fixed, false);
    }
});

test("leaves empty bodies, padded bodies, and control-flow blocks alone", () => {

    for (const input of [
        "function example() {}",
        "const example = () => {};",
        "enum Example {}",
        "function example() {\n\nreturn 1;\n}",
        "if (true) {\nrun();\n}",
        "for (;;) {\nbreak;\n}",
    ]) {
        assert.deepEqual(linter.verify(input, config), []);
    }
});

test("preserves comments and CRLF, including inline bodies", () => {

    for (const [
        input,
        expected,
    ] of [
            [
                "function example() { return 1; }",
                "function example() {\n\n return 1; \n}",
            ],
            [
                "function example() {\n//}\n}",
                "function example() {\n\n//}\n}",
            ],
            [
                "function example() {\r\n/* comment */\r\nreturn 1;\r\n}",
                "function example() {\r\n\r\n/* comment */\r\nreturn 1;\r\n}",
            ],
        ]) {
        assert.equal(linter.verifyAndFix(input, config).output, expected);
    }
});

test("root scripts inherit braces, function padding, and return spacing", async () => {

    const eslint = new ESLint({ cwd: new URL("../../../../../../", import.meta.url).pathname });
    const [result] = await eslint.lintText("export function example(value) {\nconst result = value + 1;\nif (value) return result;\nreturn 0;\n}\n", { filePath: "scripts/lint-fixture.mjs" });
    const ruleIds = new Set(result.messages.map(message => {

        return message.ruleId;
    }));
    assert.equal(result.warningCount, 0);
    assert.ok(ruleIds.has("curly"));
    assert.ok(ruleIds.has("avesd/body-leading-blank-line"));
    assert.ok(ruleIds.has("@stylistic/padding-line-between-statements"));
});

test("shared fixes converge for inline methods and a first-statement return", async () => {

    const eslint = new ESLint({
        cwd: new URL("../../../../../../", import.meta.url).pathname,
        fix: true,
    });
    const [result] = await eslint.lintText("export const example = { load() { return 1; } };\n", { filePath: "scripts/lint-fixture.mjs" });
    assert.deepEqual(result.messages, []);
    assert.match(result.output, /load\(\) \{\n\n\s+return 1;\n\s+\}/);
    const [second] = await eslint.lintText(result.output, { filePath: "scripts/lint-fixture.mjs" });
    assert.deepEqual(second.messages, []);
    assert.equal(second.output, undefined);
});
