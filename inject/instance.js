"use strict";

const Offsets = {
    SCRIPT_CONTEXT_VTABLE: 0x23327C,

    INSTANCE_NAME: 0x24,
    INSTANCE_PARENT: 0x30,
    INSTANCE_CHILDREN: 0x28,
    INSTANCE_DESCRIPTOR: 0xC,
    
    DESCRIPTOR_NAME: 0x4,
    
    SCRIPT_CONTEXT_GLOBAL_STATE: 0x50
}

const Instance = {
    GetName: function(addr) {
        const ptr = Memory.ReadU32(addr + Offsets.INSTANCE_NAME);

        return Memory.ReadStdString(ptr);
    },

    GetClassName: function(addr) {
        const descriptor = Memory.ReadU32(addr + Offsets.INSTANCE_DESCRIPTOR);
        const rbxName = Memory.ReadU32(descriptor + Offsets.DESCRIPTOR_NAME);
    
        return Memory.ReadStdString(rbxName + 4);
    },

    GetParent: function(addr) {
        return Memory.ReadU32(addr + Offsets.INSTANCE_PARENT);
    },

    GetChildren: function(addr) {
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

    DeepPrint: function(addr, indent) {
        ident = ident ? ident : 0;

        console.log(" ".repeat(indent) + "> 0x" + addr.toString(16).toUpperCase() + ": \"" + InstanceName(addr) + "\" (" + InstanceClassName(addr) + ")");
    
        InstanceChildren(addr).forEach((v) => DeepPrintInstance(v, indent + 1))
    }
}