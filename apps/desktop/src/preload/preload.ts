/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Preload
 */

import { desktopApi } from "./desktop-api";
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("avesd", desktopApi);
