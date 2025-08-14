"use strict";

console.log("[Lua] init");

const Lua = {
    indexes: {
        PCALL: 2004,        // f_cyb
        NEWTHREAD: 1958,    // f_iwb
        SANDBOX: 4659,      // f_fwf
        SETTABLE: 1997,     // f_vxb
        GETTABLE: 1990,     // f_oxb
        NEWLSTR: 2086,      // f_gbc
        PUSHCCLOSURE: 1986, // f_kxb
        CREATETABLE: 1994   // f_sxb
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
        setTable: 0,
        getTable: 0,
        sandbox: 0,
        newLStr: 0,
        pushCClosure: 0,
        createTable: 0,

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

                    return closure + Offsets.CLOSURE_UPVALS_BEGIN + (index - Lua.GLOBALSINDEX + 1) * 16;
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

    /*
    pushcclosure(L, ref, nups) {
        // we have all the fields, let's just do it ourselves
        const ccl = Lua.alloc(L, Offsets.CLOSURE_UPVALS_BEGIN + 0x10 * nups);

        Lua.link(L, ccl, Lua.type.FUNCTION);

        Memory.WriteU8(ccl + Offsets.CLOSURE_IS_C, 1);
        Memory.WriteU8(ccl + Offsets.CLOSURE_NUPVALUES, nups);
        Memory.WriteU32(ccl + Offsets.CLOSURE_GCLIST, 0);
        Memory.WriteU32(ccl + Offsets.CLOSURE_ENV, Memory.ReadU32(Lua.index2adr(L, Lua.GLOBALSINDEX)));
        Memory.Write32(ccl + Offsets.CCLOSURE_F, ref - (ccl + Offsets.CCLOSURE_F));

        for (let i = 0; i < nups; i++) {
            // if nups is e.g. 3, stack indices are
            // upvals[0]: -3         nups = 3, i = 0
            // upvals[1]: -2         nups = 3, i = 1
            // upvals[2]: -1         nups = 3, i = 2
            // upvals[i]: -nups + i

            const tv = Lua.index2adr(L, -nups + i);
            const cltv = ccl + Offsets.CLOSURE_UPVALS_BEGIN + i * 16;

            // just copy all tvalue bytes, no point checking
            for (let j = 0; j < 4; j++) {
                Memory.WriteU32(cltv + j * 4, Memory.ReadU32(tv + j * 4));
            }
        }

        Lua.pop(L, nups);
        Lua.WriteAndIncrementTop(L, ccl, Lua.type.FUNCTION);
    },
    */

    pushcclosure(L, ref, nups) {
        if (!Lua.internal.pushCClosure) {
            Lua.internal.pushCClosure = Lua.internal.FindFunctionIndex(Lua.indexes.PUSHCCLOSURE);
        }

        wasmImports.invoke_viii(Lua.internal.pushCClosure, L, ref, nups);
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

    settable(L, idx) {
        if (!Lua.internal.setTable) {
            Lua.internal.setTable = Lua.internal.FindFunctionIndex(Lua.indexes.SETTABLE);
        }

        wasmImports.invoke_vii(Lua.internal.setTable, L, idx);
    },

    gettable(L, idx) {
        if (!Lua.internal.getTable) {
            Lua.internal.getTable = Lua.internal.FindFunctionIndex(Lua.indexes.GETTABLE);
        }

        wasmImports.invoke_vii(Lua.internal.getTable, L, idx);
    },

    setfield(L, idx, field) {
        // we will push shit, so fix up to make sure
        if (idx < 0 && idx > Lua.REGISTRYINDEX) {
            idx -= 2;
        }

        Lua.pushstring(L, field);
        Lua.pushvalue(L, -2);
        Lua.settable(L, idx);
        Lua.pop(L, 1);
    },

    getfield(L, idx, field) {
        if (idx < 0 && idx > Lua.REGISTRYINDEX) {
            idx--;
        }

        Lua.pushstring(L, field);
        Lua.gettable(L, idx);
    },

    setglobal(L, global) {
        Lua.setfield(L, Lua.GLOBALSINDEX, global);
    },

    getglobal(L, global) {
        Lua.getfield(L, Lua.GLOBALSINDEX, global);
    },

    settop(L, top) {
        const elements = Lua.gettop(L);

        if (top == elements) {
            return;
        }

        // negative values are based off current amount of elements already on stack
        if (top < 0) {
            // + top because its negative
            return Lua.settop(L, elements + top + 1);
        }

        // decrease number of elements if top < elements
        //   i.e. 10 elements -> 5 elements, 5 < 10 == true
        if (top < elements) {
            Memory.WriteU32(L + Offsets.LUA_STATE_TOP, Memory.ReadU32(L + Offsets.LUA_STATE_BASE) + top * 16);

            return;
        }

        // otherwise, increase number of elements
        for (let i = elements; i < top; i++) {
            Lua.pushnil(L);
        }
    },

    gettop: (L) => (Memory.ReadU32(L + Offsets.LUA_STATE_TOP) - Memory.ReadU32(L + Offsets.LUA_STATE_BASE)) >> 4,
    pop:    (L, n) => Lua.settop(L, -n - 1),

    createtable(L, narray, nrec) {
        if (!Lua.internal.createTable) {
            Lua.internal.createTable = Lua.internal.FindFunctionIndex(Lua.indexes.CREATETABLE);
        }

        wasmImports.invoke_viii(Lua.internal.createTable, L, narray, nrec);
    },

    newtable: (L) => Lua.createtable(L, 0, 0),

    realloc(L, block, osize, nsize) {
        const GT = Lua.gt(L);

        return wasmImports.invoke_iiiii(Memory.ReadU32(GT + Offsets.GLOBAL_STATE_FREALLOC), Memory.ReadU32(GT + Offsets.GLOBAL_STATE_USERDATA), block, osize, nsize);
    },

    alloc: (L, s) => s == 0 ? 0 : Lua.realloc(L, 0, 0, s)
};