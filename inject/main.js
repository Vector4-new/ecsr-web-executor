"use strict";

console.log("[Main] init");

// const GLOBAL_STATE = ReadU32(possibleSCs[0] + SCRIPT_CONTEXT_GLOBAL_STATE);
console.log("Hello, world...");

let Main = {
    SPAWN: 4596,    // f_utf

    TPROTO: 9,
    TFUNCTION: 6,

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

        for (let i = 0; i < proto.protos; i++) {
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

        const GT = (Memory.ReadU32(GLOBAL_STATE + Offsets.LUA_STATE_GT) + (GLOBAL_STATE + Offsets.LUA_STATE_GT)) & 0xFFFFFFFF;

        if (!GT)
            return 0;

        Main.inverseCache = Main.Inverse(BigInt((Memory.ReadU32(GT + Offsets.GLOBAL_STATE_CKEY) + (GT + Offsets.GLOBAL_STATE_CKEY)) & 0xFFFFFFFF), 1n << 32n) & 0xFFFFFFFFn;
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

        console.log(`Proto made at ${proto}`);
        console.log(protoData);

        Memory.Zero(proto, 76);
        
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
                Memory.WriteU32(constants + i * 16 + 8, 0);

                break;
            case 1: // boolean
                Memory.WriteU32(constants + i * 16, protoData.constants[i][1] + 0);
                Memory.WriteU32(constants + i * 16 + 8, 3);

                break;
            case 3: // number
                for (let j = 0; j < 8; j++) {
                    // doubles stored as 8-char string, no encryption needed?
                    Memory.WriteU8(constants + i * 16 + j, protoData.constants[i][1].charCodeAt(j));
                }
                Memory.WriteU32(constants + i * 16 + 8, 2);

                break;
            case 4: // string
                Memory.WriteU32(constants + i * 16, Lua.newlstr(L, protoData.constants[i][1]));
                Memory.WriteU32(constants + i * 16 + 8, 4);

                break;
            }
        }

        for (let i = 0; i < protoData.localVars.length; i++) {
            Memory.WriteU32(locvars + i * 12, Lua.newlstr(L, localvars[i][0]));
            Memory.WriteU32(locvars + i * 12 + 4, protoData.localVars[i][1]);
            Memory.WriteU32(locvars + i * 12 + 8, protoData.localVars[i][2]);
        }

        Memory.WriteU32(proto + Offsets.PROTO_GCLIST, 0);

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

        // unused
        Memory.WriteU32(proto + Offsets.PROTO_LINEDEFINED, 0);
        Memory.WriteU32(proto + Offsets.PROTO_LASTLINEDEFINED, 0);
        
        Memory.WriteU32(proto + Offsets.PROTO_SOURCE, source - (proto + Offsets.PROTO_SOURCE));

        // check
        if (((Memory.ReadU32(proto + Offsets.PROTO_SOURCE) + (proto + Offsets.PROTO_SOURCE)) & 0xFFFFFFFF) != source)
            throw "Main.CreateProto: Decode(proto->source) != source";

        if (((Memory.ReadU32(proto + Offsets.PROTO_K) + (proto + Offsets.PROTO_K)) & 0xFFFFFFFF) != constants)
            throw "Main.CreateProto: Decode(proto->k) != constants";

        if (((Memory.ReadU32(proto + Offsets.PROTO_P) + (proto + Offsets.PROTO_P)) & 0xFFFFFFFF) != protos)
            throw "Main.CreateProto: Decode(proto->p) != protos";

        if (((Memory.ReadU32(proto + Offsets.PROTO_UPVALUES) + (proto + Offsets.PROTO_UPVALUES)) & 0xFFFFFFFF) != upvalues)
            throw "Main.CreateProto: Decode(proto->upvalues) != upvalues";

        if (((Memory.ReadU32(proto + Offsets.PROTO_LINEINFO) + (proto + Offsets.PROTO_LINEINFO)) & 0xFFFFFFFF) != lineinfo)
            throw "Main.CreateProto: Decode(proto->lineinfo) != lineinfo";

        if (((Memory.ReadU32(proto + Offsets.PROTO_LOCVARS) + (proto + Offsets.PROTO_LOCVARS)) & 0xFFFFFFFF) != locvars)
            throw "Main.CreateProto: Decode(proto->locvars) != locvars";

        if (((Memory.ReadU32(proto + Offsets.PROTO_CODE) + (proto + Offsets.PROTO_CODE)) & 0xFFFFFFFF) != code)
            throw "Main.CreateProto: Decode(proto->code) != code";

        // link at end.. just in case
        Lua.link(L, proto, Main.TPROTO);
        // Lua.LockObject(proto);

        return proto;
    },

    CreateLClosure(L, proto) {
        const lcl = Lua.alloc(L, 0x14);

        Memory.Zero(lcl, 0x14);

        Memory.WriteU8(lcl + Offsets.CLOSURE_IS_C, 0);
        Memory.WriteU8(lcl + Offsets.CLOSURE_NUPVALUES, 0);
        Memory.WriteU32(lcl + Offsets.CLOSURE_GCLIST, 0);
        Memory.WriteU32(lcl + Offsets.CLOSURE_ENV, Memory.ReadU32(L + Offsets.LUA_STATE_GLOBALS));
        Memory.WriteU32(lcl + Offsets.LCLOSURE_P, proto - (lcl + Offsets.LCLOSURE_P));

        if (((Memory.ReadU32(lcl + Offsets.LCLOSURE_P) + (lcl + Offsets.LCLOSURE_P)) & 0xFFFFFFFF) != proto)
            throw "Main.CreateLClosure: Decode(lcl->p) != proto";

        Lua.link(L, lcl, Main.TFUNCTION);
        //Lua.LockObject(lcl);

        return lcl
    },

    ExecuteScript(bytecodeData) {
        const state = Main.InitOrGetExploitState();

        if (!state) {
            // maybe error...

            return;
        }

        Main.EncodeInstructions(bytecodeData.main);

        const L = Lua.newthread(state);

        Lua.SetThreadIdentityAndSandbox(L, 7);

        // stk[-1] = Instance.new("LocalScript")
        Lua.getglobal(L, "Instance");
        Lua.getfield(L, -1, "new");
        Lua.pushstring(L, "LocalScript");
        Lua.pcall(L, 1, 1);

        // substr(1) to get rid of = at start
        // stk[-1].Name = bytecodeData.main.source.substr(1)
        Lua.pushstring(L, bytecodeData.main.source.substr(1));
        Lua.setfield(L, -2, "Name");

        // script = stk[-1]
        Lua.setglobal(L, "script");

        Lua.settop(L, 0);

        // spawn(CreatedFunction)
        Lua.pushcclosure(L, Lua.internal.FindFunctionIndex(Main.SPAWN), 0);
        // Lua.getglobal(L, "print");

        const proto = Main.CreateProto(L, bytecodeData.main);
        const lcl = Main.CreateLClosure(L, proto);

        const top = Memory.ReadU32(L + Offsets.LUA_STATE_TOP);

        Memory.WriteU32(top, lcl);
        Memory.WriteU32(top + 8, Main.TFUNCTION);
        Memory.WriteU32(L + Offsets.LUA_STATE_TOP, top + 16);

        Lua.pcall(L, 1, 0, 0);
        
        Lua.settop(L, 0);
        Lua.pop(state, 1);
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

    if (MainLoop === undefined) {
        // TODO: raise error

        return;
    }
    
    // I don't call InitOrGetExploitState here as I'd rather do it in main thread

    let [ result, err ] = Bytecode.Parse(detail.bytecode);

    if (err) {
        // TODO: raise error

        return;
    }

    result.main.source = `${detail.source}`;

    MainLoop.queue.push({
        name: "ExecuteScript",
        func: Main.ExecuteScript,
        arg: result
    });
});