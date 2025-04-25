"use strict";

// whole purpose is to just pass messages back and forth between exec and window...
console.log("[Messager] init");

chrome.runtime.onMessage.addListener(({ type, bytecode, source, error }, sender, sendResponse) => {
    console.log(type);
    if (type === "error") {
        // "error" is reserved...
        const event = new CustomEvent("compileError", { detail: {
            error: error
        }});

        window.dispatchEvent(event);
    }
    else if (type === "execute") {
        const event = new CustomEvent("execute", { detail: {
            bytecode: bytecode,
            source: source
        }});

        window.dispatchEvent(event);
    }
});