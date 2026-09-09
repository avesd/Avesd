/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description JSON
 */

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
