/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Preferences
 */

export type SidebarSide = "left" | "right";
export interface WorkbenchPreferencesApi {
    getSessionPosition?(): Promise<number>;
    setSessionPosition?(position: number): Promise<void>;
    getSidebarSide(): Promise<SidebarSide>;
    setSidebarSide(side: SidebarSide): Promise<void>;
}
export const workbenchPreferencesChannels = {
    sessionGet: "workbench:session-position:get",
    sessionSet: "workbench:session-position:set",
    get: "workbench:sidebar-side:get",
    set: "workbench:sidebar-side:set",
} as const;
