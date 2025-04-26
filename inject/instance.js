"use strict";

console.log("[Instance] init");

const Instance = {
    GetName(addr) {
        const ptr = Memory.ReadU32(addr + Offsets.INSTANCE_NAME);

        return Memory.ReadStdString(ptr);
    },

    GetClassName(addr) {
        const descriptor = Memory.ReadU32(addr + Offsets.INSTANCE_DESCRIPTOR);
        const rbxName = Memory.ReadU32(descriptor + Offsets.DESCRIPTOR_NAME);
    
        return Memory.ReadStdString(rbxName + 4);
    },

    GetParent(addr) {
        return Memory.ReadU32(addr + Offsets.INSTANCE_PARENT);
    },

    GetChildren(addr) {
        let children = [];

        const vector = Memory.ReadU32(addr + INSTANCE_CHILDREN);
    
        if (!vector) {
            return children;
        }
    
        const begin = Memory.ReadU32(vector);
        const end = Memory.ReadU32(vector + 4);
    
        if (!begin || !end) {
            return children;
        }
    
        // * 2 for shared_ptr
        for (let i = begin; i < end; i += GROWABLE_HEAP_U32().BYTES_PER_ELEMENT * 2) {
            children.push(Memory.ReadU32(i));
        }
    
        return children;
    },

    DeepPrint(addr, indent) {
        indent = indent ? indent : 0;

        console.log(" ".repeat(indent) + "> 0x" + addr.toString(16).toUpperCase() + ": \"" + InstanceName(addr) + "\" (" + InstanceClassName(addr) + ")");
    
        InstanceChildren(addr).forEach((v) => DeepPrintInstance(v, indent + 1))
    }
};