/**
 * @author Avesd
 * @package Plugin Data
 * @namespace TestUnit
 * @description Data Source Contribution Test
 */

import { dataSourceContribution } from "../../src/data-source-contribution";
import { describe, expect, it } from "vitest";

describe("data source plugin API", () => {

    it("publishes a runtime-neutral contribution point", () => {

        expect(dataSourceContribution.id).toBe("workspace.data-source");
    });
});
