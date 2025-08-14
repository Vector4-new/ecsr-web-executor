"use strict";

// whole purpose is to just pass messages back and forth between exec and window...
console.log("[Messager] init");

chrome.runtime.onMessage.addListener(({ type, bytecode, source, error }, sender, sendResponse) => {
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

// loadstring
window.addEventListener("requestCompile", ({ detail }) => {
    const id = detail.id;
    console.log(detail);
    
    chrome.runtime.sendMessage({
        type: "compile",
        code: detail.code,
        source: detail.script
    }).then(data => {
        console.log(data);

        const event = new CustomEvent("compileResponse", { detail: {
            id: id,
            result: data.bytecode
        }});

        window.dispatchEvent(event);
    });

    return true;
});