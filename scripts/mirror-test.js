"use strict";
const fs = require("fs");
const { startDesktopMirror } = require("../server/hermes-agent/desktop-mirror.js");

const TOKEN_FILE = "C:/Users/faza0/.hermes/hermes3d/.mirror-token";
let token = "";
try { token = fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch { /* none */ }

let emitted = 0;
const mirror = startDesktopMirror({
  token,
  emit: (frame) => {
    emitted++;
    const p = frame.payload || {};
    console.log(`EMIT ${frame.event} sessionKey=${p.sessionKey} stream=${p.stream} data=${JSON.stringify(p.data).slice(0, 120)}`);
  },
  log: (m) => console.log("[mirror]", m),
});

setTimeout(() => {
  console.log("\n=== STATUS ===");
  console.log(JSON.stringify(mirror.status(), null, 2));
  console.log("frames emitted:", emitted);
  mirror.stop();
  process.exit(0);
}, Number(process.env.TEST_MS || 15000));
