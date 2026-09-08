/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Side Panel
 */

import { classNames } from "../shared/class-names";
import type { HTMLAttributes, ReactNode, RefObject } from "react";

export interface SidePanelProps extends HTMLAttributes<HTMLElement> {
    readonly children: ReactNode;
}

export function SidePanel({ className, children, ...props }: SidePanelProps) {
    return <section
        className={classNames("avesd-side-panel", className)}
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
        className={classNames("avesd-panel-header", className)}
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
