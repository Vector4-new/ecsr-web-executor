"use strict";

console.log("[Lua] init");

// not ref :(
// $func1944 => lua_getfield

// FUNCREF :)
// $func1990 => lua_gettable 
// $func2004 => lua_pcall
// $func1984 => lua_pushstring
// $func1958 => lua_newthread

const Lua = {
    indexes: {
        PCALL: 2004,
        NEWTHREAD: 1958
    },

    internal: {
        cachedPcall: 0,
        cachedNewThread: 0,

        FindFunctionIndex(index) {
            for (let i = 0; i < wasmTable.length; i++) {
                if (wasmTable.get(i)?.name == index) {
                    return i;
                }
            }

            return 0;
        }
    },

    pcall(L, nargs, nresults, errfunc) {
        if (!Lua.internal.cachedPcall) {
            Lua.internal.cachedPcall = Lua.internal.FindFunctionIndex(Lua.indexes.PCALL);
        }

        return wasmImports.invoke_iiiii(Lua.internal.cachedPcall, L, nargs, nresults, errfunc);
    },

    newthread(L) {
        if (!Lua.internal.cachedNewThread) {
            Lua.internal.cachedNewThread = Lua.internal.FindFunctionIndex(Lua.indexes.NEWTHREAD);
        }

        return wasmImports.invoke_ii(Lua.internal.cachedNewThread, L);
    }
};