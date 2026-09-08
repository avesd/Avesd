/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description ESLint Config
 */

import { createAvesdConfig } from "@avesd/configuration/eslint";

export default createAvesdConfig(import.meta.dirname);
