"use strict";

console.log("Hello, executor");

let source = document.getElementById("source");

function GenerateRandomName() {
    const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    let str = "";

    for (let i = 0; i < 32; i++) {
        str += CHARS[Math.floor(Math.random() * CHARS.length)];
    }

    return str;
}

async function PushError(e) {
    const windows = await chrome.tabs.query({
        url: "https://ecsr.io/WebPlayer*"
    });

    if (windows[0] !== undefined) {
        chrome.tabs.sendMessage(windows[0].id, {
            type: "error",
            error: e
        });
    }
}

async function PushBytecode(bc, source) {
    const windows = await chrome.tabs.query({
        url: "https://ecsr.io/WebPlayer*"
    });

    if (windows[0] !== undefined) {
        chrome.tabs.sendMessage(windows[0].id, {
            type: "execute",
            bytecode: bc,
            source: source
        });
    }
}

document.getElementById("execute").onclick = async (e) => {
    if (source.value === undefined || source.value === null || source.value.length == 0 )
        return;

    const script = `=${GenerateRandomName()}`;

    let result = await chrome.runtime.sendMessage({
        type: "compile",
        code: source.value,
        source: script
    });

    if (!result || !result.bytecode) {
        PushError("Unable to get compilation result...");
    }
    else if (result.bytecode.charCodeAt(0) != 0x1B) {
        PushError(result.bytecode);
    }
    else {
        PushBytecode(result.bytecode, script);
    }
}

document.getElementById("open").onclick = (e) => {
    // TODO: ...
}

document.getElementById("clear").onclick = (e) => {
    source.value = "";
}