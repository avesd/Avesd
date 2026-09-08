/**
 * @author Avesd
 * @package UI
 * @namespace Root
 * @description Class Names
 */

export const classNames = (...values: readonly (string | false | null | undefined)[]): string =>
{
    return values.filter(Boolean).join(" ");
};
