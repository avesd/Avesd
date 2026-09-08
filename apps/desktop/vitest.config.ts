/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Vitest Config
 */

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            reporter: [
                "text",
                "html",
            ],
        },
        passWithNoTests: false,
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
