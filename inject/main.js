"use strict";

console.log("[Main] init");

let Main = {
    SPAWN: 4596,        // f_utf
    INSTANCE_NEW: 4168, // f_idf

    scriptContext: 0,
    executorGlobalState: 0,
    inverseCache: 0n,

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

    EncodeInstructions(proto) {
        for (let i = 0; i < proto.instructions.length; i++) {
            proto.instructions[i] = Number((BigInt(proto.instructions[i]) * Main.inverseCache) & 0xFFFFFFFFn);
        }

        for (let i = 0; i < proto.protos.length; i++) {
            proto.protos[i].source = proto.source;

            Main.EncodeInstructions(proto.protos[i]);
        }
    },

    ValidateScriptContext(sc) {
        // maybe more?
        return Memory.ReadU32(sc) === Offsets.SCRIPT_CONTEXT_VTABLE && Memory.ReadU32(sc + Offsets.INSTANCE_DESCRIPTOR) === Offsets.SCRIPT_CONTEXT_DESCRIPTOR;
    },

    FindOrGetScriptContext() {
        if (Main.scriptContext)
            return Main.scriptContext;

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

    // also gets ckey
    InitOrGetExploitState() {
        if (Main.executorGlobalState)
            return Main.executorGlobalState;

        if (!Main.scriptContext)
            return 0;

        const GLOBAL_STATE = Memory.ReadU32(Main.scriptContext + Offsets.SCRIPT_CONTEXT_GLOBAL_STATE);

        if (!GLOBAL_STATE)
            return 0;

        const GT = Lua.gt(GLOBAL_STATE);

        if (!GT)
            return 0;

        Main.inverseCache = Main.Inverse(BigInt(Memory.ReadU32(GT + Offsets.GLOBAL_STATE_CKEY) + (GT + Offsets.GLOBAL_STATE_CKEY)) & 0xFFFFFFFFn, 1n << 32n) & 0xFFFFFFFFn;
        Main.executorGlobalState = Lua.newthread(GLOBAL_STATE);

        if (!Main.executorGlobalState)
            return 0;

        Lua.LockObject(Main.executorGlobalState);
        Lua.SetThreadIdentityAndSandbox(Main.executorGlobalState, 7);
        Lua.setfield(GLOBAL_STATE, Lua.REGISTRYINDEX, "_GLOBAL_STATE_DO_NOT_REMOVE_");
        
        return Main.executorGlobalState;
    },
    
    CreateProto(L, protoData) {
        const proto = Lua.alloc(L, 76);
        
        Lua.link(L, proto, Lua.type.PROTO);
        
        const constants = Lua.alloc(L, protoData.constants.length * 16);
        const protos = Lua.alloc(L, protoData.protos.length * 4);
        const code = Lua.alloc(L, protoData.instructions.length * 4);
        const upvalues = Lua.alloc(L, protoData.upvalueNames.length * 4);
        const lineinfo = Lua.alloc(L, protoData.lineInfo.length * 4);
        const locvars = Lua.alloc(L, protoData.localVars.length * 12);
        const source = Lua.newlstr(L, protoData.source);
        
        protoData.instructions.forEach((v, k) => Memory.WriteU32(code + k * 4, v));
        protoData.lineInfo.forEach((v, k) => Memory.WriteU32(lineinfo + k * 4, v));
        protoData.protos.forEach((v, k) => Memory.WriteU32(protos + k * 4, Main.CreateProto(L, v)));
        protoData.upvalueNames.forEach((v, k) => Memory.WriteU32(upvalues + k * 4, Lua.newlstr(L, v)));
        
        for (let i = 0; i < protoData.constants.length; i++) {
            switch (protoData.constants[i][0]) {
            case 0: // nil
                Memory.WriteU64(constants + i * 16, 0n);
                Memory.WriteU32(constants + i * 16 + 8, Lua.type.NIL);

                break;
            case 1: // boolean
                Memory.WriteU32(constants + i * 16, protoData.constants[i][1] + 0);
                Memory.WriteU32(constants + i * 16 + 8, Lua.type.BOOLEAN);

                break;
            case 3: // number
                for (let j = 0; j < 8; j++) {
                    // doubles stored as 8-char string, no encryption needed?
                    Memory.WriteU8(constants + i * 16 + j, protoData.constants[i][1].charCodeAt(j));
                }
                Memory.WriteU32(constants + i * 16 + 8, Lua.type.NUMBER);

                break;
            case 4: // string
                Memory.WriteU32(constants + i * 16, Lua.newlstr(L, protoData.constants[i][1]));
                Memory.WriteU32(constants + i * 16 + 8, Lua.type.STRING);

                break;
            }
        }

        for (let i = 0; i < protoData.localVars.length; i++) {
            Memory.WriteU32(locvars + i * 12, Lua.newlstr(L, protoData.localVars[i][0]));
            Memory.WriteU32(locvars + i * 12 + 4, protoData.localVars[i][1]);
            Memory.WriteU32(locvars + i * 12 + 8, protoData.localVars[i][2]);
        }

        Memory.WriteU32(proto + Offsets.PROTO_K, constants - (proto + Offsets.PROTO_K));
        Memory.WriteU32(proto + Offsets.PROTO_SIZEK, protoData.constants.length);
        Memory.WriteU32(proto + Offsets.PROTO_P, protos - (proto + Offsets.PROTO_P));
        Memory.WriteU32(proto + Offsets.PROTO_SIZEP, protoData.protos.length);
        Memory.WriteU32(proto + Offsets.PROTO_CODE, code - (proto + Offsets.PROTO_CODE));
        Memory.WriteU32(proto + Offsets.PROTO_SIZECODE, protoData.instructions.length);
        Memory.WriteU32(proto + Offsets.PROTO_SIZELINEINFO, protoData.lineInfo.length);
        Memory.WriteU32(proto + Offsets.PROTO_SIZEUPVALUES, protoData.upvalueNames.length);
        Memory.WriteU8(proto + Offsets.PROTO_NUPS, protoData.numUpvalues);
        Memory.WriteU32(proto + Offsets.PROTO_UPVALUES, upvalues - (proto + Offsets.PROTO_UPVALUES));
        Memory.WriteU8(proto + Offsets.PROTO_NUMPARAMS, protoData.numParams);
        Memory.WriteU8(proto + Offsets.PROTO_IS_VARARG, protoData.isVararg);
        Memory.WriteU8(proto + Offsets.PROTO_MAXSTACKSIZE, protoData.maxStackSize);
        Memory.WriteU32(proto + Offsets.PROTO_LINEINFO, lineinfo - (proto + Offsets.PROTO_LINEINFO));
        Memory.WriteU32(proto + Offsets.PROTO_SIZELOCVARS, protoData.localVars.length);
        Memory.WriteU32(proto + Offsets.PROTO_LOCVARS, locvars - (proto + Offsets.PROTO_LOCVARS));
        Memory.WriteU32(proto + Offsets.PROTO_SOURCE, source - (proto + Offsets.PROTO_SOURCE));

        // unused
        Memory.WriteU32(proto + Offsets.PROTO_LINEDEFINED, 0);
        Memory.WriteU32(proto + Offsets.PROTO_LASTLINEDEFINED, 0);
        Memory.WriteU32(proto + Offsets.PROTO_GCLIST, 0);

        return proto;
    },

    CreateLClosure(L, proto) {
        const lcl = Lua.alloc(L, 0x14);

        Lua.link(L, lcl, Lua.type.FUNCTION);

        Memory.WriteU8(lcl + Offsets.CLOSURE_IS_C, 0);
        Memory.WriteU8(lcl + Offsets.CLOSURE_NUPVALUES, 0);
        Memory.WriteU32(lcl + Offsets.CLOSURE_GCLIST, 0);
        Memory.WriteU32(lcl + Offsets.CLOSURE_ENV, Memory.ReadU32(L + Offsets.LUA_STATE_GLOBALS));
        Memory.WriteU32(lcl + Offsets.LCLOSURE_P, proto - (lcl + Offsets.LCLOSURE_P));

        return lcl;
    },

    ExecuteScript(bytecodeData) {
        const state = Main.InitOrGetExploitState();

        if (!state) {
            alert("Main.ExecuteScript: unable to create exploit state");

            return;
        }

        Main.EncodeInstructions(bytecodeData.main);

        const L = Lua.newthread(state);

        Lua.SetThreadIdentityAndSandbox(L, 7);

        // stk[-1] = Instance.new("LocalScript")
        // we don't know state of env, this is safer
        Lua.pushcfunction(L, Lua.internal.FindFunctionIndex(Main.INSTANCE_NEW));
        Lua.pushstring(L, "LocalScript");
        Lua.pcall(L, 1, 1);
        
        const instance = Memory.ReadU32(Lua.topointer(L, -1) + Offsets.UDATA_DATA_BEGIN);

        // substr(1) to get rid of = at start
        Instance.SetName(instance, bytecodeData.main.source.substr(1));

        // script = stk[-1]
        Lua.setglobal(L, "script");

        Lua.settop(L, 0);

        // spawn(CreatedFunction)
        Lua.pushcfunction(L, Lua.internal.FindFunctionIndex(Main.SPAWN));
        Lua.WriteAndIncrementTop(L, Main.CreateLClosure(L, Main.CreateProto(L, bytecodeData.main)), Lua.type.FUNCTION);
        Lua.pcall(L, 1, 0, 0);
        
        Lua.settop(L, 0);
        Lua.pop(state, 1);
    },

    WriteError(err) {
        const state = Main.InitOrGetExploitState();

        if (!state) {
            alert("Main.WriteError: unable to create exploit state");

            return;
        }

        const L = state;

        Lua.getglobal(L, "warn");
        Lua.pushstring(L, err);
        Lua.pcall(L, 1, 0, 0);
    }
};


window.addEventListener("compileError", ({ detail }) => {
    if (!Main.FindOrGetScriptContext()) {
        alert("execute: Couldn't find ScriptContext");

        return;
    }

    if (MainLoop === undefined) {
        alert("execute: Couldn't find main loop");

        return;
    }
    
    MainLoop.queue.push({
        name: "SendError",
        func: Main.WriteError,
        arg: detail.error
    });
});

window.addEventListener("execute", ({ detail }) => {
    if (!Main.FindOrGetScriptContext()) {
        alert("execute: Couldn't find ScriptContext");

        return;
    }

    if (MainLoop === undefined) {
        alert("execute: Couldn't find main loop");

        return;
    }
    
    // I don't call InitOrGetExploitState here as I'd rather do it in main thread

    let [ result, err ] = Bytecode.Parse(detail.bytecode);

    if (err) {
        MainLoop.queue.push({
            name: "SendError",
            func: Main.WriteError,
            arg: err
        });

        return;
    }

    result.main.source = `${detail.source}`;

    MainLoop.queue.push({
        name: "ExecuteScript",
        func: Main.ExecuteScript,
        arg: result
    });
});