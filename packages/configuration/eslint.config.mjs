/**
 * @author Avesd
 * @package Configuration
 * @namespace Root
 * @description ESLint Config
 */

import { createAvesdConfig } from "./eslint/index.mjs";

export default createAvesdConfig(import.meta.dirname);
