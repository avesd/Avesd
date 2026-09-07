import { describe, expect, it } from "vitest";
import { parseWebCommand, parseWebResult, parseWebUrl } from "./web-surface";

describe("web surface boundaries", () => {
  it("allows secure pages and loopback development, rejects privileged schemes and credentials", () => {
    for (const url of ["https://example.com", "http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"]) {
      expect(parseWebUrl(url)).toBeInstanceOf(URL);
    }
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "https://a:b@example.com", "http://example.com", "http://localhost.evil.test", "bad url"]) {
      expect(() => parseWebUrl(url)).toThrow();
    }
  });
  it("validates IPC discriminants, dimensions and script limits at runtime", () => {
    expect(() => parseWebCommand({ type: "run", id: "x", document: 0, origin: "https://example.com", code: "1", mode: "node" })).toThrow();
    expect(() => parseWebCommand({ type: "bounds", id: "x", bounds: { x: 0, y: 0, width: Infinity, height: 5, visible: true } })).toThrow();
    expect(() => parseWebCommand({ type: "run", id: "x", document: 0, origin: "https://example.com", code: "x".repeat(32769), mode: "page" })).toThrow();
    expect(() => parseWebCommand({ type: "delete-all", id: "x" })).toThrow();
  });
  it("only accepts bounded JSON, including protection against cyclic or deeply nested results", () => {
    expect(parseWebResult({ title: "Synthetic", value: [1, true, null] })).toEqual({ title: "Synthetic", value: [1, true, null] });
    const cycle: unknown[] = []; cycle.push(cycle);
    for (const value of [undefined, Infinity, new Date(), () => 1, cycle, "x".repeat(65537), "界".repeat(22000)]) {
      expect(() => parseWebResult(value)).toThrow();
    }
  });
});
