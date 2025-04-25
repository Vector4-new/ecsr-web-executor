"use strict";

const Memory = {
    ReadString: function(address, len) {
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

    ReadU8:   (a) => HEAPU8[a],
    ReadU16:  (a) => HEAPU16[a >> 1],
    ReadU32:  (a) => HEAPU32[a >> 2],
    ReadU64:  (a) => HEAPU64[a >> 3],
    Read8:    (a) => HEAP8[a],
    Read16:   (a) => HEAP16[a >> 1],
    Read32:   (a) => HEAP32[a >> 2],
    Read64:   (a) => HEAP64[a >> 3],
    ReadF32:  (a) => HEAPF32[a >> 2],
    ReadF64:  (a) => HEAPF64[a >> 3],

    WriteU8:  (a, v) => HEAPU8[a] = v,
    WriteU16: (a, v) => HEAPU16[a >> 1] = v,
    WriteU32: (a, v) => HEAPU32[a >> 2] = v,
    WriteU64: (a, v) => HEAPU64[a >> 3] = v,
    Write8:   (a, v) => HEAP8[a] = v,
    Write16:  (a, v) => HEAP16[a >> 1] = v,
    Write32:  (a, v) => HEAP32[a >> 2] = v,
    Write64:  (a, v) => HEAP64[a >> 3] = v,
    WriteF32: (a, v) => HEAPF32[a >> 2] = v,
    WriteF64: (a, v) => HEAPF64[a >> 3] = v,
};