/**
 * @author Avesd
 * @package Configuration
 * @namespace Root
 * @description Create Vitest Config
 */

import type { ViteUserConfig } from "vitest/config";
import { defineConfig, mergeConfig } from "vitest/config";

export const createVitestConfig = (overrides: ViteUserConfig = {}) => {

    return mergeConfig(defineConfig({
        test: {
            include: ["test/{unit,integration}/**/*.test.{ts,tsx}"],
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
