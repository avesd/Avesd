/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Vitest Config
 */

import { createVitestConfig } from "@avesd/configuration/vitest";
import { playwright } from "@vitest/browser-playwright";

export default createVitestConfig({
    test: {
        projects: [
            {
                test: {
                    environment: "node",
                    exclude: ["test/**/*.browser.test.{ts,tsx}"],
                    include: ["test/unit/**/*.test.{ts,tsx}"],
                    name: "unit",
                },
            },
            {
                test: {
                    environment: "node",
                    include: ["test/integration/**/*.test.{ts,tsx}"],
                    name: "integration",
                },
            },
            {
                test: {
                    browser: {
                        enabled: true,
                        headless: true,
                        instances: [{ browser: "chromium" }],
                        provider: playwright(),
                    },
                    include: ["test/unit/**/*.browser.test.{ts,tsx}"],
                    name: "browser",
                },
            },
        ],
    },
});
