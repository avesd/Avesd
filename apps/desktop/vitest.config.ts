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
                    exclude: ["src/**/*.browser.test.{ts,tsx}"],
                    include: ["src/**/*.test.{ts,tsx}"],
                    name: "unit",
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
                    include: ["src/**/*.browser.test.{ts,tsx}"],
                    name: "browser",
                },
            },
        ],
    },
});
