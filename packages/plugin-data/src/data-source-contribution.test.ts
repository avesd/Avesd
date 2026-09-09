/**
 * @author Avesd
 * @package Plugin Data
 * @namespace Root
 * @description Data Source Contribution Test
 */

import { dataSourceContribution } from "./data-source-contribution";
import { describe, expect, it } from "vitest";

describe("data source plugin API", () => {
    it("publishes a runtime-neutral contribution point", () => {
        expect(dataSourceContribution.id).toBe("workspace.data-source");
    });
});
