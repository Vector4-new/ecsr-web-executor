"use strict";

console.log("[Bytecode] init");

const Bytecode = {
    // expected values
    HEADER_MAGIC: "\x1BLua",
    HEADER_VERSION: 0x51,  // 5.1
    HEADER_FORMAT: 0,               // Official format
    HEADER_ENDIANNESS: 1,           // Little-endian
    HEADER_INT_SIZE: 4,
    HEADER_SIZE_T_SIZE: 4,
    HEADER_INSTRUCTION_SIZE: 4,
    HEADER_NUMBER_SIZE: 8,
    HEADER_NUMBER_TYPE: 0,          // Floating-point
  
    Parse(bytecode) {
        let result = {};

        [ result.headerData, bytecode ] = Bytecode.ParseHeader(bytecode);
        
        // in this case, bytecode is actually the error
        if (result.headerData === null || result.headerData === undefined)
            return [ null, bytecode ];
        
        // no validation beyond this point
        [ result.main, bytecode ] = Bytecode.ParseFunction(bytecode);

        // bytecode is now consumed, but return just in case
        return [ result, bytecode ];
    },

    ParseHeader(header) {
        let headerData = {};

        headerData.magic = header.substr(0, 4);
        headerData.version = header.charCodeAt(4);
        headerData.format = header.charCodeAt(5);
        headerData.endianness = header.charCodeAt(6);
        headerData.intSize = header.charCodeAt(7);
        headerData.sizetSize = header.charCodeAt(8);
        headerData.instructionSize = header.charCodeAt(9);
        headerData.numberSize = header.charCodeAt(10);
        headerData.numberType = header.charCodeAt(11);

        // validate
        if (headerData.magic !== Bytecode.HEADER_MAGIC)
            return [ null, "bad magic in bytecode header" ];

        if (headerData.version !== Bytecode.HEADER_VERSION)
            return [ null, "bad version in bytecode header" ];

        if (headerData.format !== Bytecode.HEADER_FORMAT)
            return [ null, "unsupported bytecode format" ];

        if (headerData.intSize !== Bytecode.HEADER_INT_SIZE)
            return [ null, "incorrect int size" ];

        if (headerData.sizetSize !== Bytecode.HEADER_SIZE_T_SIZE)
            return [ null, "incorrect size_t size" ];

        if (headerData.instructionSize !== Bytecode.HEADER_INSTRUCTION_SIZE)
            return [ null, "incorrect instruction size" ];

        if (headerData.numberSize !== Bytecode.HEADER_NUMBER_SIZE)
            return [ null, "incorrect number size" ];

        if (headerData.numberType !== Bytecode.HEADER_NUMBER_TYPE)
            return [ null, "incorrect number type" ];

        return [ headerData, header.substr(12) ];
    },

    ParseFunction(bytecode) {
        let funcData = {};

        [ funcData.source, bytecode ] = Bytecode.ReadString(bytecode);
        [ funcData.lineDefined, bytecode ] = Bytecode.ReadUInt32(bytecode);
        [ funcData.lastLineDefined, bytecode ] = Bytecode.ReadUInt32(bytecode);
        [ funcData.numUpvalues, bytecode ] = Bytecode.ReadUInt8(bytecode);
        [ funcData.numParams, bytecode ] = Bytecode.ReadUInt8(bytecode);
        [ funcData.isVararg, bytecode ] = Bytecode.ReadUInt8(bytecode);
        [ funcData.maxStackSize, bytecode ] = Bytecode.ReadUInt8(bytecode);
        
        let instructions = [];
        let instructionsCount;

        [ instructionsCount, bytecode ] = Bytecode.ReadUInt32(bytecode);

        for (let i = 0; i < instructionsCount; i++) {
            let instruction;

            [ instruction, bytecode ] = Bytecode.ReadUInt32(bytecode);

            instructions.push(instruction);
        }

        funcData.instructions = instructions;

        let constants = [];
        let constantsCount;

        [ constantsCount, bytecode ] = Bytecode.ReadUInt32(bytecode);

        for (let i = 0; i < constantsCount; i++) {
            let constantType;

            [ constantType, bytecode ] = Bytecode.ReadUInt8(bytecode);

            switch (constantType) {
            case 0:
                constants.push([ constantType, null ]);

                break;
            case 1:
                let bool;

                [ bool, bytecode ] = Bytecode.ReadUInt8(bytecode);

                constants.push([ constantType, bool ]);

                break;
            case 3:
                constants.push([ constantType, bytecode.substr(0, 8) ]);

                bytecode = bytecode.substr(8);

                break;
            case 4:
                let str;

                [ str, bytecode ] = Bytecode.ReadString(bytecode);

                constants.push([ constantType, str ]);

                break;
            }
        }

        funcData.constants = constants;

        let protos = [];
        let protoCount;

        [ protoCount, bytecode ] = Bytecode.ReadUInt32(bytecode);

        for (let i = 0; i < protoCount; i++) {
            let proto;

            [ proto, bytecode ] = Bytecode.ParseFunction(bytecode);

            protos.push(proto);
        }

        funcData.protos = protos;

        let lineInfos = [];
        let sizeLineInfo;

        [ sizeLineInfo, bytecode ] = Bytecode.ReadUInt32(bytecode);

        for (let i = 0; i < sizeLineInfo; i++) {
            let lineInfo;

            [ lineInfo, bytecode ] = Bytecode.ReadUInt32(bytecode);

            lineInfos.push(lineInfo);
        }

        funcData.lineInfo = lineInfos;

        let localVars = [];
        let sizeLocVars;

        [ sizeLocVars, bytecode ] = Bytecode.ReadUInt32(bytecode);

        for (let i = 0; i < sizeLocVars; i++) {
            let name;
            let start;
            let end;

            [ name, bytecode ] = Bytecode.ReadString(bytecode);
            [ start, bytecode ] = Bytecode.ReadUInt32(bytecode);
            [ end, bytecode ] = Bytecode.ReadUInt32(bytecode);

            localVars.push([ name, start, end ]);
        }

        funcData.localVars = localVars;

        let upvalueNames = [];
        let sizeUpvalueNames;

        [ sizeUpvalueNames, bytecode ] = Bytecode.ReadUInt32(bytecode);

        for (let i = 0; i < sizeUpvalueNames; i++) {
            let name;

            [ name, bytecode ] = Bytecode.ReadString(bytecode);

            upvalueNames.push(name);
        }

        funcData.upvalueNames = upvalueNames;

        return [ funcData, bytecode ];
    },

    ReadUInt8(str) {
        return [ str.charCodeAt(0), str.substr(1) ];
    },

    ReadUInt32(str) {
        return [ str.charCodeAt(0) | str.charCodeAt(1) << 8 | str.charCodeAt(2) << 16 | str.charCodeAt(3) << 24, str.substr(4) ];
    },

    ReadString(strBlock) {
        let len;
        let s = "";

        [ len, strBlock ] = Bytecode.ReadUInt32(strBlock);

        if (len === 0)
            return [ null, strBlock, null ];

        for (let i = 0; i < len - 1; i++)
            s += strBlock[i];

        return [ s, strBlock.substr(len) ];
    }
}