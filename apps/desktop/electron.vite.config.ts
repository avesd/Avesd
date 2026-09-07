import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@avesd/acp-client"] })],
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
        output: {
          entryFileNames: "index.cjs",
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
