/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Dashboard Editing
 */

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext, useState } from "react";

const DashboardEditingContext = createContext<{
    isEditing: boolean;
    setIsEditing: Dispatch<SetStateAction<boolean>>;
} | undefined>(undefined);

export function DashboardEditingProvider({ children }: {
    readonly children: ReactNode;
}) {
    const [
        isEditing,
        setIsEditing,
    ] = useState(false);
    return <DashboardEditingContext.Provider
        value={{
            isEditing,
            setIsEditing,
        }}
    >
        {children}
    </DashboardEditingContext.Provider>;
}

export function useDashboardEditing() {
    const state = useContext(DashboardEditingContext);
    if (!state) {
        throw new Error("Dashboard editing requires its workbench provider.");
    }
    return state;
}
