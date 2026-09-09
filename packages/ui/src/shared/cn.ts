/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Conditional Class Names
 */

import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...classes: ClassValue[]): string => {
    return twMerge(clsx(classes));
};
