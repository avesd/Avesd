import { createAvesdConfig } from "@avesd/configuration/eslint";

export default [
  ...createAvesdConfig(import.meta.dirname),
  {
    files: ["tests/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly", window: "readonly" } },
  },
];
