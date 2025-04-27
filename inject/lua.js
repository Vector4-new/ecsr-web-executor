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
        PCALL: 2004,        // f_cyb
        NEWTHREAD: 1958,    // f_iwb
        PUSHCCLOSURE: 1986, // f_kxb
        SETFIELD: 1998,     // f_wxb    // 1997 settable
        GETFIELD: 1991,     // f_pxb    // 1990 gettable
        SETTOP: 1960,       // f_kwb
        SANDBOX: 4659,      // f_fwf
        PUSHSTRING: 1984,

        NEWLSTR: 2086       // f_gbc
    },

    type: {
        NIL: 0,
        LIGHTUSERDATA: 1,
        BOOLEAN: 2,
        NUMBER: 3,
        STRING: 4,
        THREAD: 5,
        FUNCTION: 6,
        TABLE: 7,
        USERDATA: 8,
        PROTO: 9,
        UPVAL: 10,
        DEADKEY: 11
    },

    GLOBALSINDEX: -10002,
    ENVIRONINDEX: -10001,
    REGISTRYINDEX: -10000,

    internal: {
        pcall: 0,
        newThread: 0,
        pushCClosure: 0,
        pushString: 0,
        setField: 0,
        getField: 0,
        setTop: 0,
        sandbox: 0,
        newLStr: 0,

        FindFunctionIndex(index) {
            for (let i = 0; i < wasmTable.length; i++) {
                if (wasmTable.get(i)?.name == index) {
                    return i;
                }
            }

            return 0;
        }
    },

    UpvalueIndex(n) {
        return Lua.GLOBALSINDEX - n;
    },
    
    // does not change ScriptImpersonator/whatever current running identity, so to see the updated identity will require a yield
    SetThreadIdentityAndSandbox(L, identity) {
        if (!Lua.internal.sandbox) {
            Lua.internal.sandbox = Lua.internal.FindFunctionIndex(Lua.indexes.SANDBOX);
        }

        const sharedPtr = wasmExports.malloc(8);

        Memory.WriteU32(sharedPtr, 0);
        Memory.WriteU32(sharedPtr + 4, 0);
        
        wasmImports.invoke_viii(Lua.internal.sandbox, L, identity, sharedPtr);

        wasmExports.free(sharedPtr);
    },

    LockObject(obj) {
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(obj + Offsets.LUA_OBJECT_MARKED) | 0x60);
    },

    UnlockObject(obj) {
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(obj + Offsets.LUA_OBJECT_MARKED) & (~0x60));
    },

    newlstr(L, str) {
        if (str === undefined || str === null) {
            return 0;
        }

        if (!Lua.internal.newLStr) {
            Lua.internal.newLStr = Lua.internal.FindFunctionIndex(Lua.indexes.NEWLSTR);
        }

        const addr = Memory.AllocateString(str);
        const res = wasmImports.invoke_iiii(Lua.internal.newLStr, L, addr, str.length);

        wasmExports.free(addr);

        return res;
    },

    //  f_ebc
    link(L, obj, tt) {
        const GT = (Memory.ReadU32(L + Offsets.LUA_STATE_GT) + (L + Offsets.LUA_STATE_GT)) & 0xFFFFFFFF;

        Memory.WriteU32(obj, Memory.ReadU32(GT + Offsets.GLOBAL_STATE_ROOTGC));
        Memory.WriteU32(GT + Offsets.GLOBAL_STATE_ROOTGC, obj);
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(GT + Offsets.GLOBAL_STATE_WHITE) & 0x3);
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_TT, tt);
    },

    pcall(L, nargs, nresults, errfunc) {
        if (!Lua.internal.pcall) {
            Lua.internal.pcall = Lua.internal.FindFunctionIndex(Lua.indexes.PCALL);
        }

        return wasmImports.invoke_iiiii(Lua.internal.pcall, L, nargs, nresults, errfunc);
    },

    newthread(L) {
        if (!Lua.internal.newThread) {
            Lua.internal.newThread = Lua.internal.FindFunctionIndex(Lua.indexes.NEWTHREAD);
        }

        return wasmImports.invoke_ii(Lua.internal.newThread, L);
    },

    pushstring(L, str) {
        if (!Lua.internal.pushString) {
            Lua.internal.pushString = Lua.internal.FindFunctionIndex(Lua.indexes.PUSHSTRING);
        }

        const addr = Memory.AllocateString(str);        

        wasmImports.invoke_vii(Lua.internal.pushString, L, addr);

        wasmExports.free(addr);
    },

    pushcclosure(L, ref, nups) {
        if (!Lua.internal.pushCClosure) {
            Lua.internal.pushCClosure = Lua.internal.FindFunctionIndex(Lua.indexes.PUSHCCLOSURE);
        }

        wasmImports.invoke_viii(Lua.internal.pushCClosure, L, ref, nups);
    },

    setfield(L, idx, field) {
        if (!Lua.internal.setField) {
            Lua.internal.setField = Lua.internal.FindFunctionIndex(Lua.indexes.SETFIELD);
        }

        const str = Memory.AllocateString(field);

        wasmImports.invoke_viii(Lua.internal.setField, L, idx, str);

        wasmExports.free(str);
    },

    getfield(L, idx, field) {
        if (!Lua.internal.getField) {
            Lua.internal.getField = Lua.internal.FindFunctionIndex(Lua.indexes.GETFIELD);
        }

        const str = Memory.AllocateString(field);

        wasmImports.invoke_viii(Lua.internal.getField, L, idx, str);

        wasmExports.free(str);
    },

    getglobal(L, global) {
        Lua.getfield(L, Lua.GLOBALSINDEX, global);
    },

    setglobal(L, global) {
        Lua.setfield(L, Lua.GLOBALSINDEX, global);
    },

    settop(L, top) {
        if (!Lua.internal.setTop) {
            Lua.internal.setTop = Lua.internal.FindFunctionIndex(Lua.indexes.SETTOP);
        }

        wasmImports.invoke_vii(Lua.internal.setTop, L, top);
    },

    pop(L, nelems) {
        Lua.settop(L, -nelems - 1);
    },

    realloc(L, block, osize, nsize) {
        const GT = (Memory.ReadU32(L + Offsets.LUA_STATE_GT) + (L + Offsets.LUA_STATE_GT)) & 0xFFFFFFFF;

        return wasmImports.invoke_iiiii(Memory.ReadU32(GT + Offsets.GLOBAL_STATE_FREALLOC), Memory.ReadU32(GT + Offsets.GLOBAL_STATE_USERDATA), block, osize, nsize);
    },

    alloc(L, size) {
        if (size === 0)
            return 0;

        return Lua.realloc(L, 0, 0, size);
    }
};