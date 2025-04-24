// lol!
const SCRIPT_CONTEXT_VTABLE = 0x23327C;

const INSTANCE_NAME = 0x24;
const INSTANCE_PARENT = 0x30;
const INSTANCE_CHILDREN = 0x28;
const INSTANCE_DESCRIPTOR = 0xC;

const DESCRIPTOR_NAME = 0x4;

function ReadString(address, len) {
    let final = "";

    if (!len) {
        let val;

        while (val = HEAPU8[address++]) {
            final += String.fromCharCode(val);
        }
    }
    else {
        for (let i = 0; i < len; i++) {
            final += String.fromCharCode(HEAPU8[address + i]);
        }
    }

    return final;
}

function ReadStdString(address) {
    const embeddedSize = ReadU8(address + 11);

    if (!embeddedSize) {
        return "";
    }

    // if MSB set, then it's embedded
    if (embeddedSize & 0x7F) {
        return ReadString(address, embeddedSize);
    }

    return ReadString(ReadU32(address), ReadU32(address + 4));
}

let ReadU8  = (a) => HEAPU8[a];
let ReadU16 = (a) => HEAPU16[a >> 1];
let ReadU32 = (a) => HEAPU32[a >> 2];
let ReadU64 = (a) => HEAPU64[a >> 3];
let Read8   = (a) => HEAP8[a];
let Read16  = (a) => HEAP16[a >> 1];
let Read32  = (a) => HEAP32[a >> 2];
let Read64  = (a) => HEAP64[a >> 3];
let ReadF32 = (a) => HEAPF32[a >> 2];
let ReadF64 = (a) => HEAPF64[a >> 3];

let WriteU8  = (a, v) => HEAPU8[a] = v;
let WriteU16 = (a, v) => HEAPU16[a >> 1] = v;
let WriteU32 = (a, v) => HEAPU32[a >> 2] = v;
let WriteU64 = (a, v) => HEAPU64[a >> 3] = v;
let Write8   = (a, v) => HEAP8[a] = v;
let Write16  = (a, v) => HEAP16[a >> 1] = v;
let Write32  = (a, v) => HEAP32[a >> 2] = v;
let Write64  = (a, v) => HEAP64[a >> 3] = v;
let WriteF32 = (a, v) => HEAPF32[a >> 2] = v;
let WriteF64 = (a, v) => HEAPF64[a >> 3] = v;

let possibleSCs = [];

for (let i = 0; i < HEAPU32.length; i++) {
    if (HEAPU32[i] == SCRIPT_CONTEXT_VTABLE) {
        possibleSCs.push(i * HEAPU32.BYTES_PER_ELEMENT);
    }
}

console.log(possibleSCs);

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