/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Icon Button
 */

import { classNames } from "../shared/class-names";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
    readonly "aria-label": string;
    readonly children: ReactNode;
    readonly size?: "small" | "medium";
}

export function IconButton({ className, children, size = "medium", type = "button", ...props }: IconButtonProps) {
    return <button
        className={classNames("avesd-icon-button", `is-${size}`, className)}
        type={type}
        {...props}
    >
        {children}
    </button>;
}
