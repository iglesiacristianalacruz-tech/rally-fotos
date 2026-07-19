const assert = require("node:assert/strict");
const core = require("./app-core.js");

assert.equal(core.normalizeTeamName(" equipo    2 "), "Equipo 2");
assert.equal(core.normalizeTeamName("Brigada Norte"), "Brigada Norte");
assert.equal(core.normalizePin(" 22090198 "), "22090198");
assert.equal(core.photoKey(" EQUIPO 1 ", "abc"), "equipo 1::abc");

const items = [
  { id: "b", position: 2 },
  { id: "a", position: 1 }
];
assert.deepEqual(core.sortItems(items).map((item) => item.id), ["a", "b"]);

assert.deepEqual(
  core.completion(
    items,
    [{ item_id: "a" }],
    [{ itemId: "b" }, { itemId: "missing" }]
  ),
  { done: 2, total: 2 }
);

console.log("self-check passed");
