/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Button
 */

import { cn } from "../shared/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    readonly leading?: ReactNode;
    readonly size?: "small" | "medium";
    readonly variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ className, children, leading, size = "medium", type = "button", variant = "secondary", ...props }: ButtonProps) {
    return <button
        className={cn("avesd-button", `is-${variant}`, `is-${size}`, className)}
        type={type}
        {...props}
    >
        {leading && <span
            className="avesd-button-leading"
            aria-hidden="true"
        >
            {leading}
        </span>}
        {children}
    </button>;
}
