import { describe, expect, it } from "vitest";

import { dataSourceContribution } from "./index";

describe("data source plugin API", () => {
  it("publishes a runtime-neutral contribution point", () => {
    expect(dataSourceContribution.id).toBe("workspace.data-source");
  });
});
