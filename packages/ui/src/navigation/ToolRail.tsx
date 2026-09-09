/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Tool Rail
 */

import { cn } from "../shared/cn";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

export interface ToolRailProps extends HTMLAttributes<HTMLElement> {
    readonly children: ReactNode;
}

export function ToolRail({ className, children, ...props }: ToolRailProps) {
    return <nav
        className={cn("avesd-tool-rail", className)}
        {...props}
    >
        {children}
    </nav>;
}

export interface ToolRailButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    readonly children: ReactNode;
    readonly placement?: "default" | "bottom";
}

export const ToolRailButton = forwardRef<HTMLButtonElement, ToolRailButtonProps>(function ToolRailButton(
    { className, children, placement = "default", type = "button", ...props },
    ref,
) {
    return <button
        ref={ref}
        className={cn("avesd-tool-rail-button", placement === "bottom" && "is-bottom", className)}
        type={type}
        {...props}
    >
        {children}
    </button>;
});
