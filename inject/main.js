"use strict";

console.log("[Main] init");

// const GLOBAL_STATE = ReadU32(possibleSCs[0] + SCRIPT_CONTEXT_GLOBAL_STATE);
console.log("Hello, world...");

window.addEventListener("compileError", console.log);
window.addEventListener("execute", console.log);