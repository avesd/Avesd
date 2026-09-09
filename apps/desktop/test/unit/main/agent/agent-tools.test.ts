/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainAgent
 * @description Agent Tools Test
 */

import { agentToolDefinitions } from "../../../../src/main/agent/agent-tools";
import { describe, expect, it } from "vitest";
import * as z from "zod";

describe("agent tool schemas", () => {

    it("exposes the data-source value without a recursive JSON Schema", () => {

        const schema = z.toJSONSchema(agentToolDefinitions.avesd_update_data_source.schema);

        expect(JSON.stringify(schema)).not.toContain('"$ref"');
        expect(schema).toMatchObject({
            properties: { value: { description: "Any JSON value." } },
            required: [
                "dataSourceId",
                "value",
            ],
            type: "object",
        });
    });
});
