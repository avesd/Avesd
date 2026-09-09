/**
 * @author Avesd
 * @package Workspace
 * @namespace Root
 * @description ESLint Config
 */

import { createAvesdConfig } from "./packages/configuration/eslint/create-avesd-config.mjs";

export default createAvesdConfig(import.meta.dirname);
