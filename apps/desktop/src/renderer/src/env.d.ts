/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Env D
 */

/// <reference types="vite/client" />

import type { DesktopApi } from "../../shared/desktop-api";

declare global {
  interface Window {
    readonly avesd: DesktopApi;
  }
}

export {};

