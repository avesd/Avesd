/**
 * @author Avesd
 * @package Configuration
 * @namespace Root
 * @description Configuration exports
 */

import type { ViteUserConfig } from "vitest/config";
import { defineConfig, mergeConfig } from "vitest/config";

export const createVitestConfig = (overrides: ViteUserConfig = {}) => {
    return mergeConfig(defineConfig({
        test: {
            coverage: {
                reporter: [
                    "text",
                    "html",
                ],
            },
            passWithNoTests: false,
        },
    }), overrides);
};
