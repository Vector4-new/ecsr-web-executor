const SCRIPT_CONTEXT_VTABLE = 0x23327C;

const INSTANCE_NAME = 0x24;
const INSTANCE_PARENT = 0x30;
const INSTANCE_CHILDREN = 0x28;
const INSTANCE_DESCRIPTOR = 0xC;

const DESCRIPTOR_NAME = 0x4;

const SCRIPT_CONTEXT_GLOBAL_STATE = 0x50;

/*
let possibleSCs = [];

for (let i = 0; i < HEAPU32.length; i++) {
    if (HEAPU32[i] == SCRIPT_CONTEXT_VTABLE) {
        possibleSCs.push(i * HEAPU32.BYTES_PER_ELEMENT);
    }
}

console.log(possibleSCs);
*/

function InstanceName(addr) {
    const ptr = ReadU32(addr + INSTANCE_NAME);
    
    return ReadStdString(ptr);
}

function InstanceParent(addr) {
    return ReadU32(addr + INSTANCE_PARENT);
}

function InstanceChildren(addr) {
    let children = [];

    const vector = ReadU32(addr + INSTANCE_CHILDREN);

    if (!vector) {
        return children;
    }

    const begin = ReadU32(vector);
    const end = ReadU32(vector + 4);

    if (!begin || !end) {
        return children;
    }

    // * 2 for shared_ptr
    for (let i = begin; i < end; i += HEAPU32.BYTES_PER_ELEMENT * 2) {
        children.push(ReadU32(i));
    }

    return children;
}

function InstanceClassName(addr) {
    const descriptor = ReadU32(addr + INSTANCE_DESCRIPTOR);
    const rbxName = ReadU32(descriptor + DESCRIPTOR_NAME);

    return ReadStdString(rbxName + 4);
}

function DeepPrintInstance(addr, ident) {
    ident = ident ? ident : 0;

    console.log(" ".repeat(ident) + "> 0x" + addr.toString(16).toUpperCase() + ": \"" + InstanceName(addr) + "\" (" + InstanceClassName(addr) + ")");

    InstanceChildren(addr).forEach((v) => DeepPrintInstance(v, ident + 1))
}

// not ref :(
// $func1944 => lua_getfield

// FUNCREF :)
// $func1990 => lua_gettable 
// $func2004 => lua_pcall
// $func1984 => lua_pushstring
// $func1958 => lua_newthread
// const GLOBAL_STATE = ReadU32(possibleSCs[0] + SCRIPT_CONTEXT_GLOBAL_STATE);