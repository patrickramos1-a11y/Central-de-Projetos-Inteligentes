import { expect, test } from "bun:test";
import { collapseAllBlockIds, sanitizeCollapsedBlockIds, toggleCollapsedBlockIds } from "./blockPresentation";

test("starts open and persists only explicit collapsed blocks", () => {
  expect([...sanitizeCollapsedBlockIds([], ["a", "b"])]).toEqual([]);
  expect([...toggleCollapsedBlockIds([], "a")]).toEqual(["a"]);
  expect([...toggleCollapsedBlockIds(["a"], "a")]).toEqual([]);
});

test("recolher todos and deletion keep only valid block preferences", () => {
  expect([...collapseAllBlockIds(["a", "b", "c"])]).toEqual(["a", "b", "c"]);
  expect([...sanitizeCollapsedBlockIds(["a", "removed", "c"], ["a", "b", "c"])]).toEqual(["a", "c"]);
});
