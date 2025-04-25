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