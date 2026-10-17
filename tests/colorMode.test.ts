import { test } from "node:test";
import assert from "node:assert/strict";
import { colorMode, resolvedColorMode } from "../src/colorMode";

test("new and previously auto-saved light clients follow the system", () => {
  for (const saved of [null, "invalid", "true"]) {
    assert.equal(colorMode(saved, null), "system");
    assert.equal(colorMode(saved, "false"), "system");
    assert.equal(colorMode(saved, "true"), "dark");
  }
});
test("explicit three-state preferences override legacy values", () => {
  for (const mode of ["system", "light", "dark"] as const) {
    for (const legacy of [null, "true", "false"])
      assert.equal(colorMode(mode, legacy), mode);
  }
});
test("only system mode resolves from OS preference", () => {
  assert.equal(resolvedColorMode("system", true), "dark");
  assert.equal(resolvedColorMode("system", false), "light");
  assert.equal(resolvedColorMode("light", true), "light");
  assert.equal(resolvedColorMode("dark", false), "dark");
});
