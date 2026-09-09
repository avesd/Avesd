/**
 * @author Avesd
 * @package Configuration
 * @namespace ESLintRules
 * @description Body Leading Blank Line
 */

const functionTypes = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
]);

export const bodyLeadingBlankLine = {
    meta: {
        type: "layout",
        docs: { description: "Require a blank line after the opening brace of nonempty functions and enums." },
        fixable: "whitespace",
        schema: [],
        messages: { missing: "Leave one blank line after the opening brace of a function or enum body." },
    },
    create(context) {

        const source = context.sourceCode;
        const checkBody = node => {

            const opening = source.getFirstToken(node, token => {

                return token.value === "{";
            });
            if (!opening) {
                return;
            }
            const first = source.getTokenAfter(opening, { includeComments: true });
            if (!first || (first.type === "Punctuator" && first.value === "}") || first.loc.start.line - opening.loc.end.line >= 2) {
                return;
            }
            context.report({
                node,
                loc: opening.loc,
                messageId: "missing",
                fix(fixer) {

                    const newline = source.text.includes("\r\n") ? "\r\n" : "\n";
                    const count = first.loc.start.line === opening.loc.end.line ? 2 : 1;
                    const closing = source.getLastToken(node);
                    const previous = source.getTokenBefore(closing, { includeComments: true });
                    const fixes = [fixer.insertTextAfter(opening, newline.repeat(count))];
                    if (previous.loc.end.line === closing.loc.start.line) {
                        fixes.push(fixer.insertTextBefore(closing, newline));
                    }

                    return fixes;
                },
            });
        };

        return {
            BlockStatement(node) {

                if (functionTypes.has(node.parent.type)) {
                    checkBody(node);
                }
            },
            TSEnumDeclaration: checkBody,
        };
    },
};
