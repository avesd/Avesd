import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["electron"],
        input: {
          index: "src/main/index.ts",
          "workspace-mcp": "src/main/workspace-mcp.ts",
        },
      },
    },
    plugins: [externalizeDepsPlugin({
      exclude: [
        "@avesd/acp-client",
        "@avesd/workspace-model",
        "@modelcontextprotocol/server",
      ],
    })],
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
        input: { index: "src/preload/index.ts", "local-widget": "src/preload/local-widget.ts" },
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
  },
});
