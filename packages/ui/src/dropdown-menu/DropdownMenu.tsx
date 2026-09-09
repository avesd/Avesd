/**
 * @author Avesd
 * @package UI
 * @namespace DropdownMenu
 * @description Dropdown Menu Components
 */

import { cn } from "../shared/cn";
import { dropdownMenuContentVariants, dropdownMenuItemVariants, dropdownMenuLabelVariants, dropdownMenuRadioItemVariants } from "./style";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import type { VariantProps } from "class-variance-authority";
import { Check, ChevronRight, Circle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuPortal = Primitive.Portal;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuSub = Primitive.Sub;
export type DropdownMenuProps = ComponentProps<typeof Primitive.Root>;
export type DropdownMenuTriggerProps = ComponentProps<typeof Primitive.Trigger>;
export type DropdownMenuPortalProps = ComponentProps<typeof Primitive.Portal>;
export type DropdownMenuGroupProps = ComponentProps<typeof Primitive.Group>;
export type DropdownMenuSubProps = ComponentProps<typeof Primitive.Sub>;

export type DropdownMenuContentProps = ComponentProps<typeof Primitive.Content>
    & VariantProps<typeof dropdownMenuContentVariants> & {
        readonly portalProps?: ComponentProps<typeof Primitive.Portal>;
    };

export function DropdownMenuContent({ className, margin, portalProps, ...props }: DropdownMenuContentProps) {

    return <Primitive.Portal
        {...portalProps}
    >
        <Primitive.Content
            className={cn(dropdownMenuContentVariants({ margin }), className)}
            {...props}
        />
    </Primitive.Portal>;
}

export type DropdownMenuItemProps = ComponentProps<typeof Primitive.Item> & VariantProps<typeof dropdownMenuItemVariants>;
export function DropdownMenuItem({ className, variant, isUseCursorPointer, ...props }: DropdownMenuItemProps) {

    return <Primitive.Item
        className={cn(dropdownMenuItemVariants({
            variant,
            isUseCursorPointer,
        }), className)}
        {...props}
    />;
}

export type DropdownMenuItemAppearanceProps = ComponentProps<"div"> & VariantProps<typeof dropdownMenuItemVariants>;
export function DropdownMenuItemAppearance({ className, variant, isUseCursorPointer, ...props }: DropdownMenuItemAppearanceProps) {

    return <div
        className={cn(dropdownMenuItemVariants({
            variant,
            isUseCursorPointer,
        }), className)}
        {...props}
    />;
}

export type DropdownMenuItemContentProps = ComponentProps<"div"> & {
    readonly useHoverEffect?: boolean;
    readonly useFocusEffect?: boolean;
    readonly titleStartContent?: ReactNode;
    readonly titleEndContent?: ReactNode;
    readonly description?: ReactNode;
    readonly startContent?: ReactNode;
    readonly endContent?: ReactNode;
};
export function DropdownMenuItemContent({ className, children, description, startContent, endContent, titleStartContent, titleEndContent, useHoverEffect, useFocusEffect, ...props }: DropdownMenuItemContentProps) {

    return <div
        className={cn("avesd-dropdown-item-content", {
            "has-hover-effect": useHoverEffect,
            "has-focus-effect": useFocusEffect,
        }, className)}
        {...props}
    >
        {startContent}
        <div
            className="avesd-dropdown-text"
        >
            <div
                className="avesd-dropdown-title"
            >
                {titleStartContent}
                <span>
                    {children}
                </span>
                {titleEndContent}
            </div>
            {description !== undefined && description !== null && <div
                className="avesd-dropdown-description"
            >
                {description}
            </div>}
        </div>
        {endContent}
    </div>;
}

export type DropdownMenuLabelProps = ComponentProps<typeof Primitive.Label> & VariantProps<typeof dropdownMenuLabelVariants> & {
    readonly titleClassName?: string;
    readonly descriptionClassName?: string;
    readonly startContent?: ReactNode;
    readonly endContent?: ReactNode;
    readonly description?: ReactNode;
};
export function DropdownMenuLabel({ className, fontWeight, titleClassName, descriptionClassName, children, startContent, endContent, description, ...props }: DropdownMenuLabelProps) {

    return <Primitive.Label
        className={cn(dropdownMenuLabelVariants({ fontWeight }), className)}
        {...props}
    >
        <div
            className={cn("avesd-dropdown-title", titleClassName)}
        >
            {startContent}
            <span>
                {children}
            </span>
            {endContent}
        </div>
        {description !== undefined && description !== null && <div
            className={cn("avesd-dropdown-description", descriptionClassName)}
        >
            {description}
        </div>}
    </Primitive.Label>;
}

export type DropdownMenuCheckboxItemProps = ComponentProps<typeof Primitive.CheckboxItem>;
export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: DropdownMenuCheckboxItemProps) {

    return <Primitive.CheckboxItem
        className={cn("avesd-dropdown-item avesd-dropdown-choice", className)}
        checked={checked}
        {...props}
    >
        <Primitive.ItemIndicator
            className="avesd-dropdown-indicator"
        >
            {checked === "indeterminate" ? <span
                aria-hidden="true"
            >
                −
            </span> : <Check
                size={14}
                aria-hidden="true"
            />}
        </Primitive.ItemIndicator>
        {children}
    </Primitive.CheckboxItem>;
}

export type DropdownMenuRadioGroupProps = ComponentProps<typeof Primitive.RadioGroup>;
export function DropdownMenuRadioGroup({ className, value, ...props }: DropdownMenuRadioGroupProps) {

    return <Primitive.RadioGroup
        className={cn("avesd-dropdown-radio-group", className)}
        data-selected={value !== undefined && value !== ""}
        value={value}
        {...props}
    />;
}

export type DropdownMenuRadioItemProps = ComponentProps<typeof Primitive.RadioItem> & VariantProps<typeof dropdownMenuRadioItemVariants>;
export function DropdownMenuRadioItem({ className, children, hidePaddingWhenNotSelected, ...props }: DropdownMenuRadioItemProps) {

    return <Primitive.RadioItem
        className={cn(dropdownMenuRadioItemVariants({ hidePaddingWhenNotSelected }), className)}
        {...props}
    >
        <Primitive.ItemIndicator
            className="avesd-dropdown-indicator"
        >
            <Circle
                size={7}
                fill="currentColor"
                aria-hidden="true"
            />
        </Primitive.ItemIndicator>
        {children}
    </Primitive.RadioItem>;
}

export type DropdownMenuSeparatorProps = ComponentProps<typeof Primitive.Separator>;
export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {

    return <Primitive.Separator
        className={cn("avesd-dropdown-separator", className)}
        {...props}
    />;
}

export type DropdownMenuShortcutProps = ComponentProps<"span">;
export function DropdownMenuShortcut({ className, ...props }: DropdownMenuShortcutProps) {

    return <span
        className={cn("avesd-dropdown-shortcut", className)}
        {...props}
    />;
}

export type DropdownMenuSubTriggerProps = ComponentProps<typeof Primitive.SubTrigger> & {
    readonly isInset?: boolean;
};
export function DropdownMenuSubTrigger({ className, children, isInset, ...props }: DropdownMenuSubTriggerProps) {

    return <Primitive.SubTrigger
        className={cn("avesd-dropdown-item avesd-dropdown-sub-trigger", { "is-inset": isInset }, className)}
        {...props}
    >
        {children}
        <ChevronRight
            className="avesd-dropdown-sub-arrow"
            size={14}
            aria-hidden="true"
        />
    </Primitive.SubTrigger>;
}

export type DropdownMenuSubContentProps = ComponentProps<typeof Primitive.SubContent> & {
    readonly portalProps?: ComponentProps<typeof Primitive.Portal>;
};
export function DropdownMenuSubContent({ className, portalProps, ...props }: DropdownMenuSubContentProps) {

    return <Primitive.Portal
        {...portalProps}
    >
        <Primitive.SubContent
            className={cn("avesd-dropdown-content", className)}
            {...props}
        />
    </Primitive.Portal>;
}
