import { describe, expect, it } from "vitest";
import { deriveSermon } from "./document";
import { EXAMPLE_DERIVED, EXAMPLE_DOC } from "./sermon-example";

describe("deriveSermon (cópia do painel)", () => {
  it("o documento de exemplo deriva no EXAMPLE_DERIVED, o mesmo par da API", () => {
    expect(deriveSermon(EXAMPLE_DOC)).toEqual(EXAMPLE_DERIVED);
  });
});
