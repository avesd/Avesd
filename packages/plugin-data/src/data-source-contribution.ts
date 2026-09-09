/**
 * @author Avesd
 * @package Plugin Data
 * @namespace Root
 * @description Data Source Contribution
 */

import { defineContributionPoint } from "@avesd/plugin-api";
import type { JsonObject, JsonValue } from "@avesd/workspace-model";

export interface DataSourceContribution {
    readonly configuration: {
        readonly default: JsonObject;
        readonly schema?: JsonObject;
        readonly version: number;
    };
    readonly dataType: string;
    readonly description?: string;
    readonly displayName: string;
    readonly initialValue: JsonValue;
    readonly sourceTypeId: string;
}

export const dataSourceContribution = defineContributionPoint<DataSourceContribution>("workspace.data-source");
