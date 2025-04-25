"use strict";

console.log("[Memory] init");

const Memory = {
    ReadString: function(address, len) {
        let final = "";

        if (!len) {
            let val;

            while (val = GROWABLE_HEAP_U8()[address++]) {
                final += String.fromCharCode(val);
            }
        }
        else {
            for (let i = 0; i < len; i++) {
                final += String.fromCharCode(GROWABLE_HEAP_U8()[address + i]);
            }
        }

        return final;
    },

    ReadStdString: function(address) {
        const embeddedSize = ReadU8(address + 11);

        if (!embeddedSize) {
            return "";
        }

        // if MSB set, then it's embedded
        if (embeddedSize & 0x7F) {
            return ReadString(address, embeddedSize);
        }

        return ReadString(ReadU32(address), ReadU32(address + 4));
    },

    ReadU8:   (a) => GROWABLE_HEAP_U8()[a],
    ReadU16:  (a) => GROWABLE_HEAP_U16()[a >> 1],
    ReadU32:  (a) => GROWABLE_HEAP_U32()[a >> 2],
    ReadU64:  (a) => GROWABLE_HEAP_U64()[a >> 3],
    Read8:    (a) => GROWABLE_HEAP_8()[a],
    Read16:   (a) => GROWABLE_HEAP_16()[a >> 1],
    Read32:   (a) => GROWABLE_HEAP_32()[a >> 2],
    Read64:   (a) => GROWABLE_HEAP_64()[a >> 3],
    ReadF32:  (a) => GROWABLE_HEAP_F32()[a >> 2],
    ReadF64:  (a) => GROWABLE_HEAP_F64()[a >> 3],

    WriteU8:  (a, v) => GROWABLE_HEAP_U8()[a] = v,
    WriteU16: (a, v) => GROWABLE_HEAP_U16()[a >> 1] = v,
    WriteU32: (a, v) => GROWABLE_HEAP_U32()[a >> 2] = v,
    WriteU64: (a, v) => GROWABLE_HEAP_U64()[a >> 3] = v,
    Write8:   (a, v) => GROWABLE_HEAP_8()[a] = v,
    Write16:  (a, v) => GROWABLE_HEAP_16()[a >> 1] = v,
    Write32:  (a, v) => GROWABLE_HEAP_32()[a >> 2] = v,
    Write64:  (a, v) => GROWABLE_HEAP_64()[a >> 3] = v,
    WriteF32: (a, v) => GROWABLE_HEAP_F32()[a >> 2] = v,
    WriteF64: (a, v) => GROWABLE_HEAP_F64()[a >> 3] = v,
};