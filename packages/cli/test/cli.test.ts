import { describe, it, expect } from "vitest";
import { parseJsonArg, parseTagsArg } from "../src/utils.js";

describe("CLI utilities", () => {
  describe("parseJsonArg", () => {
    it("parses valid JSON", () => {
      const result = parseJsonArg('{"key":"value"}');
      expect(result).toEqual({ key: "value" });
    });

    it("throws on invalid JSON", () => {
      expect(() => parseJsonArg("not json")).toThrow();
    });
  });

  describe("parseTagsArg", () => {
    it("parses comma-separated tags", () => {
      const result = parseTagsArg("tag1,tag2,tag3");
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("trims whitespace", () => {
      const result = parseTagsArg(" tag1 , tag2 ");
      expect(result).toEqual(["tag1", "tag2"]);
    });

    it("filters empty strings", () => {
      const result = parseTagsArg("tag1,,tag2");
      expect(result).toEqual(["tag1", "tag2"]);
    });

    it("handles single tag", () => {
      const result = parseTagsArg("single");
      expect(result).toEqual(["single"]);
    });
  });
});
