/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Electron Vite Config
 */

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
    main: {
        build: {
            externalizeDeps: {
                exclude: [
                    "@avesd/acp-client",
                    "@avesd/workspace-model",
                    "@modelcontextprotocol/server",
                ],
            },
            rollupOptions: {
                external: ["electron"],
                input: {
                    index: "src/main/main.ts",
                    "workspace-mcp": "src/main/agent/workspace-mcp.ts",
                },
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                external: ["electron"],
                input: {
                    index: "src/preload/preload.ts",
                    "local-widget": "src/preload/local-widget.ts",
                },
                output: {
                    entryFileNames: "[name].cjs",
                    format: "cjs",
                },
            },
        },
    },
    renderer: {
        root: "src/renderer",
        plugins: [react()],
    },
});
