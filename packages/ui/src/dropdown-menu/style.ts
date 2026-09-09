/**
 * @author Avesd
 * @package UI
 * @namespace DropdownMenu
 * @description Dropdown Menu Variants
 */

import { cva } from "class-variance-authority";

export const dropdownMenuContentVariants = cva("avesd-dropdown-content", {
    variants: {
        margin: {
            none: "",
            small: "is-margin-small",
            medium: "is-margin-medium",
            large: "is-margin-large",
        },
    },
    defaultVariants: { margin: "small" },
});

export const dropdownMenuItemVariants = cva("avesd-dropdown-item", {
    variants: {
        variant: {
            default: "",
            destructive: "is-destructive",
        },
        isUseCursorPointer: {
            true: "is-pointer",
            false: "",
        },
    },
    defaultVariants: {
        variant: "default",
        isUseCursorPointer: true,
    },
});

export const dropdownMenuLabelVariants = cva("avesd-dropdown-label", {
    variants: {
        fontWeight: {
            semibold: "is-semibold",
            regular: "is-regular",
        },
    },
    defaultVariants: { fontWeight: "semibold" },
});

export const dropdownMenuRadioItemVariants = cva("avesd-dropdown-item avesd-dropdown-choice", {
    variants: {
        hidePaddingWhenNotSelected: {
            true: "is-conditional-padding",
            false: "",
        },
    },
    defaultVariants: { hidePaddingWhenNotSelected: false },
});
