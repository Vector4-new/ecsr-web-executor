"use strict";

console.log("[Main] init");

// const GLOBAL_STATE = ReadU32(possibleSCs[0] + SCRIPT_CONTEXT_GLOBAL_STATE);
console.log("Hello, world...");

let Main = {
    scriptContext: 0,
    executorGlobalState: 0,
    inverseCache: 0,

    ValidateScriptContext(sc) {
        // maybe more?
        return Memory.ReadU32(sc) === Offsets.SCRIPT_CONTEXT_VTABLE && Memory.ReadU32(sc + Offsets.INSTANCE_DESCRIPTOR) === Offsets.SCRIPT_CONTEXT_DESCRIPTOR;
    },

    FindOrGetScriptContext() {
        if (GROWABLE_HEAP_U32 === undefined)
            return 0;

        for (let i = 0; i < GROWABLE_HEAP_U32().length; i++) {
            if (GROWABLE_HEAP_U32()[i] === Offsets.SCRIPT_CONTEXT_VTABLE && Main.ValidateScriptContext(i << 2)) {
                Main.scriptContext = i << 2;

                break;
            }
        }

        return Main.scriptContext;
    },

    InitOrGetExploitState() {
        if (Main.executorGlobalState)
            return Main.executorGlobalState;

        if (!Main.scriptContext)
            return 0;

        const GLOBAL_STATE = Memory.ReadU32(Main.scriptContext + Offsets.SCRIPT_CONTEXT_GLOBAL_STATE);

        if (!GLOBAL_STATE)
            return 0;

        Main.executorGlobalState = Lua.newthread(GLOBAL_STATE);

        if (!Main.executorGlobalState)
            return 0;

        // don't gc me!!!
        // set fixed & sfixed bit
        Memory.WriteU8(Main.executorGlobalState + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(Main.executorGlobalState + Offsets.LUA_OBJECT_MARKED) | 0x60);

        return Main.executorGlobalState;
    },

    Inverse(a, n) {
        // LOL STOLEN
        let t = 0n;
        let newt = 1n;

        let r = n;
        let newr = a;

        while (newr != 0n) {
            let q = r / newr;

            let curt = t;
            t = newt;
            newt = (curt - q * newt) & 0xFFFFFFFFFFFFFFFFn;

            let curr = r;
            r = newr;
            newr = (curr - q * newr) & 0xFFFFFFFFFFFFFFFFn;
        }

        return (t < 0n) ? (t + n) & 0xFFFFFFFFFFFFFFFFn : t;
    },

    ExecuteScript(bytecodeData) {
        
    }
};


window.addEventListener("compileError", ({ detail }) => {
    // TODO: push error
});

window.addEventListener("execute", ({ detail }) => {
    if (!Main.FindOrGetScriptContext()) {
        // TODO: raise error

        return;
    }
    
    // I don't call InitOrGetExploitState here as I'd rather do it in main thread

    let [ result, err ] = Bytecode.Parse(detail.bytecode);

    if (err) {
        // TODO: raise error

        return;
    }

    result.main.source = `=${detail.source}`;

    MainLoop.queue.push({
        name: "ExecuteScript",
        func: Main.ExecuteScript,
        arg: result
    });
});