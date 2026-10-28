const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { MANUAL_PATH, resolveManualImage } = require("../src/routes/ayudaRoute");

test("help manual is readable and image names cannot leave the folder", () => {
  assert.equal(fs.existsSync(MANUAL_PATH), true);
  const markdown = fs.readFileSync(MANUAL_PATH, "utf8");
  assert.match(markdown, /Manual de usuario/);
  assert.equal(resolveManualImage("../package.json"), null);
  assert.equal(resolveManualImage("..\\package.json"), null);
  assert.equal(resolveManualImage("inicio-sesion.png")?.endsWith("inicio-sesion.png"), true);
  assert.equal(fs.existsSync(resolveManualImage("inicio-sesion.png")), true);
});
