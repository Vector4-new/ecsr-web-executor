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
        NONE: -1,

        NIL: 0,
        LIGHTUSERDATA: 1,
        NUMBER: 2,
        BOOLEAN: 3,
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

    WriteAndIncrementTop(L, val, tt) {
        const top = Memory.ReadU32(L + Offsets.LUA_STATE_TOP);

        if (tt == Lua.type.NUMBER) {
            Memory.WriteF64(top, val);
        }
        else {
            Memory.WriteU32(top, val);
        }

        Memory.WriteU32(top + 8, tt);

        Memory.WriteU32(L + Offsets.LUA_STATE_TOP, top + 16);
    },

    LockObject(obj) {
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(obj + Offsets.LUA_OBJECT_MARKED) | 0x60);
    },

    UnlockObject(obj) {
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(obj + Offsets.LUA_OBJECT_MARKED) & (~0x60));
    },

    gt(L) {
        return (Memory.ReadU32(L + Offsets.LUA_STATE_GT) + (L + Offsets.LUA_STATE_GT)) & 0xFFFFFFFF;
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
        const GT = Lua.gt(L);

        Memory.WriteU32(obj, Memory.ReadU32(GT + Offsets.GLOBAL_STATE_ROOTGC));
        Memory.WriteU32(GT + Offsets.GLOBAL_STATE_ROOTGC, obj);
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_MARKED, Memory.ReadU8(GT + Offsets.GLOBAL_STATE_WHITE) & 0x3);
        Memory.WriteU8(obj + Offsets.LUA_OBJECT_TT, tt);
    },

    // inaccessible, not in function table
    index2adr(L, index) {
        if (index <= Lua.REGISTRYINDEX) {
            switch (index) {
                case Lua.REGISTRYINDEX: {
                    return Lua.gt(L) + Offsets.GLOBAL_STATE_REGISTRY;
                }
                case Lua.ENVIRONINDEX: {
                    const ci = Memory.ReadU32(L + Offsets.LUA_STATE_CALLINFO);
                    const funcPtr = Memory.ReadU32(ci + Offsets.CALLINFO_FUNC);
                    const closure = Memory.ReadU32(funcPtr);

                    Memory.WriteU32(L + Offsets.LUA_STATE_ENV, Memory.ReadU32(closure + Offsets.CLOSURE_ENV));
                    Memory.WriteU32(L + Offsets.LUA_STATE_ENV + 8, Lua.type.TABLE);

                    return L + Offsets.LUA_STATE_ENV;
                }
                case Lua.GLOBALSINDEX: {
                    return L + Offsets.LUA_STATE_GLOBALS;
                }
                default: {
                    // upvalue index
                    const ci = Memory.ReadU32(L + Offsets.LUA_STATE_CALLINFO);
                    const funcPtr = Memory.ReadU32(ci + Offsets.CALLINFO_FUNC);
                    const closure = Memory.ReadU32(funcPtr);

                    return closure + Offsets.CLOSURE_UPVALS_BEGIN + (-index - Lua.GLOBALSINDEX - 1) * 4;
                }
            }
        }

        if (index < 0) {            
            const addr = Memory.ReadU32(L + Offsets.LUA_STATE_TOP) + index * 16;

            if (addr < Memory.ReadU32(L + Offsets.LUA_STATE_BASE)) {
                return Offsets.LUA_NILOBJECT;
            }

            return addr;
        }

        const addr = Memory.ReadU32(L + Offsets.LUA_STATE_BASE) + (index - 1) * 16;

        if (addr >= Memory.ReadU32(L + Offsets.LUA_STATE_TOP)) {
            return Offsets.LUA_NILOBJECT;
        }

        return addr;
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

    pushnil:     (L) =>    Lua.WriteAndIncrementTop(L, 0, Lua.type.NIL),
    pushboolean: (L, b) => Lua.WriteAndIncrementTop(L, +b, Lua.type.BOOLEAN),
    pushnumber:  (L, n) => Lua.WriteAndIncrementTop(L, n, Lua.type.NUMBER),
    pushstring:  (L, s) => Lua.WriteAndIncrementTop(L, Lua.newlstr(L, s), Lua.type.STRING),

    pushcclosure(L, ref, nups) {
        // we have all the fields, let's just do it ourselves
        const ccl = Lua.alloc(L, Offsets.CLOSURE_UPVALS_BEGIN + 0x10 * nups);

        Lua.link(L, ccl, Lua.type.FUNCTION);

        Memory.WriteU8(ccl + Offsets.CLOSURE_IS_C, 1);
        Memory.WriteU8(ccl + Offsets.CLOSURE_NUPVALUES, nups);
        Memory.WriteU32(ccl + Offsets.CLOSURE_GCLIST, 0);
        Memory.WriteU32(ccl + Offsets.CLOSURE_ENV, Memory.ReadU32(Lua.index2adr(L, Lua.GLOBALSINDEX)));
        Memory.WriteU32(ccl + Offsets.CCLOSURE_F, ref - (ccl + Offsets.CCLOSURE_F));

        for (let i = 0; i < nups; i++) {
            // if nups is e.g. 3, stack indices are
            // upvals[0]: -3         nups = 3, i = 0
            // upvals[1]: -2         nups = 3, i = 1
            // upvals[2]: -1         nups = 3, i = 2
            // upvals[i]: -nups + i

            const tv = Lua.index2adr(L, -nups + i);
            const cltv = fn + Offsets.CLOSURE_UPVALS_BEGIN + i * 16;

            // just copy all tvalue bytes, no point checking
            for (let j = 0; j < 4; j++) {
                Memory.WriteU32(cltv + j * 4, Memory.ReadU32(tv + j * 4));
            }
        }

        Lua.pop(L, nups);
        Lua.WriteAndIncrementTop(L, ccl, Lua.type.FUNCTION);
    },

    pushvalue(L, idx) {
        const tv = Lua.index2adr(L, idx);
        const tt = Memory.ReadU32(tv + 8);

        Lua.WriteAndIncrementTop(L, tt == Lua.type.NUMBER ? Memory.ReadF64(tv) : Memory.ReadU32(tv), tt);
    },

    pushcfunction: (L, r) => Lua.pushcclosure(L, r, 0),

    // can't use type, clashes with field
    // man, that was ass to debug LOL
    objtype(L, idx) {
        const tv = Lua.index2adr(L, idx);

        if (tv == Offsets.LUA_NILOBJECT) {
            return Lua.type.NONE;
        }

        return Memory.ReadU32(tv + 8);
    },

    isnoneornil: (L, idx) => Lua.objtype(L, idx) == Lua.type.NONE || Lua.objtype(L, idx) == Lua.type.NIL,
    isnumber:    (L, idx) => Lua.objtype(L, idx) == Lua.type.NUMBER,
    isboolean:   (L, idx) => Lua.objtype(L, idx) == Lua.type.BOOLEAN,
    isstring:    (L, idx) => Lua.objtype(L, idx) == Lua.type.STRING,

    tonumber:  (L, idx) => Memory.ReadF64(Lua.index2adr(L, idx)),
    toboolean: (L, idx) => !!Memory.ReadU32(Lua.index2adr(L, idx)),
    topointer: (L, idx) => Memory.ReadU32(Lua.index2adr(L, idx)),
    
    tostring(L, idx) {
        const tsv = Memory.ReadU32(Lua.index2adr(L, idx));

        return Memory.ReadString(tsv + Offsets.TSTRING_DATA, Memory.ReadU32(tsv + Offsets.TSTRING_LEN));
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
        const GT = Lua.gt(L);

        return wasmImports.invoke_iiiii(Memory.ReadU32(GT + Offsets.GLOBAL_STATE_FREALLOC), Memory.ReadU32(GT + Offsets.GLOBAL_STATE_USERDATA), block, osize, nsize);
    },

    alloc(L, size) {
        if (size === 0)
            return 0;

        return Lua.realloc(L, 0, 0, size);
    }
};