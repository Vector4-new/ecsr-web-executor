"use strict";

console.log("[Memory] init");

const Memory = {
    ReadString(address, len) {
        return UTF8ToString(address, len);
    },

    ReadStdString(address) {
        const embeddedSize = Memory.ReadU8(address + 11);

        if (!embeddedSize) {
            return "";
        }

        // if MSB set, then it's embedded
        if (embeddedSize & 0x7F) {
            return Memory.ReadString(address, embeddedSize);
        }

        return Memory.ReadString(Memory.ReadU32(address), Memory.ReadU32(address + 4));
    },

    // allocates and writes
    AllocateString(str) {
        const addr = wasmExports.malloc(str.length + 1);

        stringToUTF8(str, addr, str.length + 1);

        return addr;
    },

    Zero(addr, len) {
        for (let i = 0; i < len; i++) {
            GROWABLE_HEAP_U8()[addr + i] = 0;
        }
    },

    ReadU8:   (a) => GROWABLE_HEAP_U8()[a],
    ReadU16:  (a) => GROWABLE_HEAP_U16()[a >> 1],
    ReadU32:  (a) => GROWABLE_HEAP_U32()[a >> 2],
    ReadU64:  (a) => HEAPU64[a >> 3],
    Read8:    (a) => GROWABLE_HEAP_I8()[a],
    Read16:   (a) => GROWABLE_HEAP_I16()[a >> 1],
    Read32:   (a) => GROWABLE_HEAP_I32()[a >> 2],
    Read64:   (a) => HEAP64[a >> 3],
    ReadF32:  (a) => GROWABLE_HEAP_F32()[a >> 2],
    ReadF64:  (a) => GROWABLE_HEAP_F64()[a >> 3],

    WriteU8:  (a, v) => GROWABLE_HEAP_U8()[a] = v,
    WriteU16: (a, v) => GROWABLE_HEAP_U16()[a >> 1] = v,
    WriteU32: (a, v) => GROWABLE_HEAP_U32()[a >> 2] = v,
    WriteU64: (a, v) => HEAPU64[a >> 3] = v,
    Write8:   (a, v) => GROWABLE_HEAP_I8()[a] = v,
    Write16:  (a, v) => GROWABLE_HEAP_I16()[a >> 1] = v,
    Write32:  (a, v) => GROWABLE_HEAP_I32()[a >> 2] = v,
    Write64:  (a, v) => HEAP64[a >> 3] = v,
    WriteF32: (a, v) => GROWABLE_HEAP_F32()[a >> 2] = v,
    WriteF64: (a, v) => GROWABLE_HEAP_F64()[a >> 3] = v,
};