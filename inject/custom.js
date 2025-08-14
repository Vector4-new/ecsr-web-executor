"use strict";

console.log("[Custom] init");

let Custom = {
    // find this in bytecode
    // import function env_eglTerminate(a:int):int; // func203
    EGL_TERMINATE_NAME: 203,
    terminateCache: 0,

    functions: [],

    CustomFunctionHandler(L) {
        // this is eglTerminate
        console.log(`lua state ${L}`);

        const id = Lua.tonumber(L, Lua.UpvalueIndex(1));

        if (id > 0) {
            return Custom.functions[id - 1].fn(L);
        }

        return 0;
    },

    Init() {
        let newSource = _eglTerminate.toString();

        newSource = newSource.replace("function _eglTerminate", "window._eglTerminate = function");
        newSource = newSource.replace("(ENVIRONMENT_IS_PTHREAD)", "(display != 62e3){ return Custom.CustomFunctionHandler(display); } if (ENVIRONMENT_IS_PTHREAD)");

        eval(newSource);
    },

    InstallFunctions(L) {
        Custom.terminateCache = Lua.internal.FindFunctionIndex(Custom.EGL_TERMINATE_NAME);

        Custom.functions.forEach((v) => {
            console.log(v);

            if (v.registerGlobal) {
                Lua.pushnumber(L, v.id);
                Lua.pushcclosure(L, Custom.terminateCache, 1);
                Lua.setglobal(L, v.name);
            }
        });
    },

    RegisterFunction(name, func, registerGlobal = true) {
        console.log(`[Custom] Registering "${name}" with ID ${Custom.functions.length + 1}`);

        Custom.functions.push({
            id: Custom.functions.length + 1,
            name: name,
            fn: func,
            registerGlobal: registerGlobal
        });
    },

    GetFunction(name) {
        return Custom.functions.find((v) => v.name === name);
    }
}

let compileResults = {};

window.addEventListener("compileResponse", ({ detail }) => {
    compileResults[detail.id] = detail.result;
});

/*
// it doesnt work lol
Custom.RegisterFunction("loadstring", async (L) => {
    if (Lua.gettop(L) < 1 || Lua.objtype(L, 1) != Lua.type.STRING) {
        Lua.pushnil(L);
        Lua.pushstring(L, "bad arguments");

        return 2;
    }

    const source = Lua.tostring(L, 1);
    let chunkname;

    if (Lua.gettop(L) == 2 && Lua.objtype(L, 2) == Lua.type.STRING) {
        chunkname = Lua.tostring(L, 2);
    }
    else {
        chunkname = source;
    }

    const id = Math.random().toString();

    const event = new CustomEvent("requestCompile", { detail: {
        code: source,
        script: chunkname,
        id: id
    }});

    window.dispatchEvent(event);

    const TIMEOUT = 2000;
    const now = Date.now();

    // can't block, since js is single threaded
    await new Promise((resolve, reject) => {
        let id = setInterval(() => {
            if (compileResults[id] !== undefined) {
                clearInterval(id);
                resolve();

                return;
            }
            else if (Date.now() - now > TIMEOUT) {
                console.log("[Custom] loadstring compilation timed out");

                clearInterval(id);
                resolve();          // can reject but its checked anyways

                return;
            }
        }, 1);
    });

    if (compileResults[id] === undefined) {
        Lua.pushnil(L);
        Lua.pushstring(L, "compilation timed out");

        return 2;
    }

    let [ result, err ] = Bytecode.Parse(detail.result);

    if (err) {
        Lua.pushnil(L);
        Lua.pushstring(L, err);

        delete compileResults[id];

        return 2;
    }

    result.main.source = `${detail.source}`;

    Main.EncodeInstructions(result.main);

    Lua.WriteAndIncrementTop(L, Main.CreateLClosure(L, Main.CreateProto(L, result.main)), Lua.type.FUNCTION);
    Lua.pushnil(L);

    delete compileResults[id];

    return 2;
});
*/

Custom.RegisterFunction("setreadonly", (L) => {
    if (Lua.gettop(L) != 2 || Lua.objtype(L, 1) != Lua.type.TABLE || Lua.objtype(L, 2) != Lua.type.BOOLEAN) {
        return 0;
    }

    Memory.WriteU8(Lua.topointer(L, 1) + Offsets.TABLE_READONLY, +Lua.toboolean(L, 2));

    return 0;
});

Custom.RegisterFunction("isreadonly", (L) => {
    if (Lua.gettop(L) != 1 || Lua.objtype(L, 1) != Lua.type.TABLE) {
        Lua.pushboolean(L, false);

        return 1;
    }

    Lua.pushboolean(L, Memory.ReadU8(Lua.topointer(L, 1) + Offsets.TABLE_READONLY));
    
    return 1;
});

Custom.RegisterFunction("getrenv", (L) => {
    const GLOBAL_STATE = Memory.ReadU32(Main.scriptContext + Offsets.SCRIPT_CONTEXT_GLOBAL_STATE);

    Lua.pushvalue(GLOBAL_STATE, Lua.GLOBALSINDEX);

    const tv = Lua.index2adr(GLOBAL_STATE, -1);

    Lua.WriteAndIncrementTop(L, Memory.ReadU32(tv), Memory.ReadU32(tv + 8));
    Lua.pop(GLOBAL_STATE, 1);

    return 1;
});

Custom.RegisterFunction("getgenv", (L) => {
    Lua.pushvalue(Main.executorGlobalState, Lua.GLOBALSINDEX);

    const tv = Lua.index2adr(Main.executorGlobalState, -1);

    Lua.WriteAndIncrementTop(L, Memory.ReadU32(tv), Memory.ReadU32(tv + 8));
    Lua.pop(Main.executorGlobalState, 1);

    return 1;
});

Custom.RegisterFunction("getreg", (L) => {
    Lua.pushvalue(L, Lua.REGISTRYINDEX);

    return 1;
});

Custom.RegisterFunction("getgc", (L) => {
    let includeTables = false;

    if (Lua.gettop(L) == 1 && Lua.objtype(L, 1) == Lua.type.BOOLEAN) {
        includeTables = Lua.toboolean(L, 1);
    }

    const gt = Lua.gt(L);
    const white = Memory.ReadU8(gt + Offsets.GLOBAL_STATE_WHITE);
    let current = Memory.ReadU32(gt + Offsets.GLOBAL_STATE_ROOTGC);
    let index = 1;

    Lua.createtable(L, 2048, 0);

    while (current) {
        if ((Memory.ReadU8(current + Offsets.LUA_OBJECT_MARKED) & white) !== 0) {
            const tt = Memory.ReadU8(current + Offsets.LUA_OBJECT_TT);

            if (tt != Lua.type.TABLE || (tt == Lua.type.TABLE && includeTables)) {
                Lua.pushnumber(L, index++);
                Lua.WriteAndIncrementTop(L, current, Memory.ReadU8(current + Offsets.LUA_OBJECT_TT));
                Lua.settable(L, -3);
            }
        }

        current = Memory.ReadU32(current);
    }

    return 1;
});


/*
too much effort. who is going to use this anyways
if you want to go through the trouble i have all proto fields so you can do shit like debug.getconstants

Custom.RegisterFunction("getrawmetatable", (L) => {
    return 0;
});

Custom.RegisterFunction("setrawmetatable", (L) => {
    return 0;
});
Custom.RegisterFunction("getnilinstances", (L) => {
    return 0;
});

Custom.RegisterFunction("getinstances", (L) => {
    return 0;
});
*/

Custom.RegisterFunction("islclosure", (L) => {
    if (Lua.gettop(L) != 1 || Lua.objtype(L, 1) != Lua.type.FUNCTION) {
        Lua.pushboolean(L, false);

        return 1;
    }

    const cl = Lua.topointer(L, 1);

    Lua.pushboolean(L, !Memory.ReadU8(cl + Offsets.CLOSURE_IS_C));

    return 0;
});

Custom.RegisterFunction("iscclosure", (L) => {
    if (Lua.gettop(L) != 1 || Lua.objtype(L, 1) != Lua.type.FUNCTION) {
        Lua.pushboolean(L, false);

        return 1;
    }

    const cl = Lua.topointer(L, 1);

    Lua.pushboolean(L, Memory.ReadU8(cl + Offsets.CLOSURE_IS_C));

    return 0;
});

Custom.RegisterFunction("checkclosure", (L) => {
    if (Lua.gettop(L) != 1 || Lua.objtype(L, 1) != Lua.type.FUNCTION) {
        Lua.pushboolean(L, false);

        return 1;
    }

    const cl = Lua.topointer(L, 1);
    const isC = Memory.ReadU8(cl + Offsets.CLOSURE_IS_C);

    if (isC) {
        const funcIndex = Memory.Read32(cl + Offsets.CCLOSURE_F) + (cl + Offsets.CCLOSURE_F);

        Lua.pushboolean(L, funcIndex == Custom.terminateCache);
    }
    else {
        const p = Memory.Read32(cl + Offsets.LCLOSURE_P) + (cl + Offsets.LCLOSURE_P);
        const code = Memory.Read32(p + Offsets.PROTO_CODE) + (p + Offsets.PROTO_CODE);
        const sizecode = Memory.Read32(p + Offsets.PROTO_SIZECODE);

        Lua.pushboolean(L, Memory.ReadU32(code + (sizecode - 1) * 4) == 0xFFFFFFFF);
    }

    return 1;
});