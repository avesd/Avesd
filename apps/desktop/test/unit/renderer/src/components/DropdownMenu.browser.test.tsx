/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitRendererSrcComponents
 * @description Dropdown Menu Browser Test
 */

import "@avesd/ui/styles.css";
import { Button, cn, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuItemContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@avesd/ui";
import { useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

let root: Root | undefined;
afterEach(() => {

    root?.unmount();
    document.body.replaceChildren();
});

function renderMenu(onSelect = vi.fn()) {

    function Menu() {

        const [
            checked,
            setChecked,
        ] = useState<boolean | "indeterminate">("indeterminate");
        const [
            value,
            setValue,
        ] = useState("comfortable");

        return <DropdownMenu>
            <DropdownMenuTrigger
                asChild
            >
                <Button>Workspace actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                aria-label="Workspace actions"
                style={{ width: 280 }}
            >
                <DropdownMenuLabel
                    description={<span>Synthetic workspace</span>}
                >
                    Workspace
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                    <DropdownMenuItem
                        onSelect={onSelect}
                    >
                        <DropdownMenuItemContent
                            description={<span>Manage local preferences</span>}
                        >
                            Settings
                        </DropdownMenuItemContent>
                        <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled
                        onSelect={onSelect}
                    >
                        Unavailable action
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                    checked={checked}
                    onCheckedChange={setChecked}
                    onSelect={(event) => {

                        event.preventDefault();
                    }}
                >
                    Show details
                </DropdownMenuCheckboxItem>
                <DropdownMenuRadioGroup
                    value={value}
                    onValueChange={setValue}
                >
                    <DropdownMenuRadioItem
                        value="comfortable"
                        onSelect={(event) => {

                            event.preventDefault();
                        }}
                    >
                        Comfortable
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                        value="compact"
                        onSelect={(event) => {

                            event.preventDefault();
                        }}
                    >
                        Compact
                    </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem
                            onSelect={onSelect}
                        >
                            Duplicate workspace
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            variant="destructive"
                            onSelect={onSelect}
                        >
                            Remove workspace
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>;
    }
    const container = document.createElement("div");
    container.style.padding = "24px";
    document.body.append(container);
    root = createRoot(container);
    root.render(<Menu />);

    return onSelect;
}

it("composes conditional classes and resolves conflicting utilities", () => {

    expect(cn("px-2", [
        "px-4",
        false,
    ], { "font-bold": true })).toBe("px-4 font-bold");
});

it("renders rich content, updates checkbox/radio state, and opens portaled submenus", async () => {

    await page.viewport(900, 700);
    const selected = renderMenu();
    await expect.element(page.getByRole("button", { name: "Workspace actions" })).toBeVisible();
    await page.getByRole("button", { name: "Workspace actions" }).click();
    await expect.element(page.getByText("⌘,")).toBeVisible();
    await expect.element(page.getByText("Manage local preferences")).toBeVisible();
    await expect.element(page.getByRole("menuitem", { name: "Unavailable action" })).toHaveAttribute("aria-disabled", "true");
    const checkbox = page.getByRole("menuitemcheckbox");
    await expect.element(checkbox).toHaveAttribute("aria-checked", "mixed");
    await checkbox.click();
    await expect.element(checkbox).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemradio", {
        name: "Compact",
        exact: true,
    }).click();
    await expect.element(page.getByRole("menuitemradio", {
        name: "Compact",
        exact: true,
    })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitem", { name: "More actions" }).hover();
    await expect.element(page.getByRole("menuitem", { name: "Duplicate workspace" })).toBeVisible();
    await expect.poll(() => {

        return document.getAnimations().filter((animation) => {

            return animation.playState === "running";
        }).length;
    }).toBe(0);
    await page.viewport(360, 480);
    await expect.poll(() => {

        return page.getByRole("menuitem", { name: "Duplicate workspace" }).element()
            .getBoundingClientRect().right;
    }).toBeLessThanOrEqual(360);
    await page.getByRole("menuitem", { name: "Duplicate workspace" }).click();
    expect(selected).toHaveBeenCalledOnce();
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
});

it("opens by keyboard, skips disabled items, activates by Enter, and restores focus", async () => {

    const selected = renderMenu();
    const trigger = page.getByRole("button", { name: "Workspace actions" });
    await expect.element(trigger).toBeVisible();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByRole("menuitem", { name: /Settings/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByRole("menuitemcheckbox")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(trigger).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(selected).toHaveBeenCalledOnce();
    await expect.element(trigger).toHaveFocus();
});

it("supports controlled state, outside dismissal, and narrow viewport placement", async () => {

    const onOpenChange = vi.fn();
    function ControlledMenu() {

        const [
            open,
            setOpen,
        ] = useState(false);

        return <DropdownMenu
            open={open}
            onOpenChange={(next) => {

                setOpen(next); onOpenChange(next);
            }}
        >
            <DropdownMenuTrigger
                asChild
            >
                <Button>Controlled menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                margin="none"
                sideOffset={4}
            >
                <DropdownMenuItem>Local action</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>;
    }
    await page.viewport(360, 480);
    const container = document.createElement("div");
    container.style.cssText = "display:flex;justify-content:flex-end;padding:8px";
    document.body.append(container);
    root = createRoot(container);
    root.render(<ControlledMenu />);
    await page.getByRole("button", { name: "Controlled menu" }).click();
    await expect.element(page.getByRole("menuitem")).toBeVisible();
    const bounds = page.getByRole("menu").element()
        .getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(360);
    await expect.poll(() => {

        return document.getAnimations().filter((animation) => {

            return animation.playState === "running";
        }).length;
    }).toBe(0);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange.mock.calls.map(([value]) => {

        return value;
    })).toEqual([
        true,
        false,
    ]);
    await page.getByRole("button", { name: "Controlled menu" }).click();
    await userEvent.click(document.body, {
        position: {
            x: 20,
            y: 300,
        },
        force: true,
    });
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await page.viewport(900, 700);
});
