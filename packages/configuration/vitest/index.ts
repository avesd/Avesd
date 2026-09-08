/**
 * @author Avesd
 * @package Configuration
 * @namespace Root
 * @description Configuration exports
 */

import { defineConfig } from "vitest/config";

export const createVitestConfig = () => {
    return defineConfig({
        test: {
            coverage: {
                reporter: [
                    "text",
                    "html",
                ],
            },
            passWithNoTests: false,
        },
    });
};

