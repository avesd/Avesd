/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Side Panel
 */

import { cn } from "../shared/cn";
import type { HTMLAttributes, ReactNode, RefObject } from "react";

export interface SidePanelProps extends HTMLAttributes<HTMLElement> {
    readonly children: ReactNode;
}

export function SidePanel({ className, children, ...props }: SidePanelProps) {

    return <section
        className={cn("avesd-side-panel", className)}
        role="dialog"
        {...props}
    >
        {children}
    </section>;
}

export type PanelHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
    readonly actions?: ReactNode;
    readonly leading?: ReactNode;
    readonly title: ReactNode;
    readonly titleRef?: RefObject<HTMLHeadingElement | null>;
};

export function PanelHeader({ actions, className, leading, title, titleRef, ...props }: PanelHeaderProps) {

    return <header
        className={cn("avesd-panel-header", className)}
        {...props}
    >
        {leading}
        <h2
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
        >
            {title}
        </h2>
        {actions && <div
            className="avesd-panel-header-actions"
        >
            {actions}
        </div>}
    </header>;
}
