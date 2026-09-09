/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Preferences
 */

export type SidebarSide = "left" | "right";
export interface WorkbenchPreferencesApi {
    getSidebarSide(): Promise<SidebarSide>;
    setSidebarSide(side: SidebarSide): Promise<void>;
}
export const workbenchPreferencesChannels = {
    get: "workbench:sidebar-side:get",
    set: "workbench:sidebar-side:set",
} as const;
