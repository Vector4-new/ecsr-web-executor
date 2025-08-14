#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
#include "lopcodes.h"
#include "lvm.h"
#include "lobject.h"

#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include <stdint.h>
#include <stdbool.h>

lua_State* L;

int main() {
	L = luaL_newstate();

	luaL_openlibs(L);

	return 0;
}


/* for the new security layer that was added */
#define LUAVM_DAX_MO 0x29451AFB
#define LUAVM_DAX_ME 0x72394BC8
#define LUAVM_DAX_AO 0x46582A8B
#define LUAVM_DAX_AE 0x62A0B4E3

#define RSIZE_C		9
#define RSIZE_B		9
#define RSIZE_Bx		(RSIZE_C + RSIZE_B)
#define RSIZE_A		8

#define RSIZE_OP		6

#define RPOS_OP		(RPOS_A + RSIZE_A)
#define RPOS_A	    (RPOS_C + RSIZE_C)
#define RPOS_C		(RPOS_B + RSIZE_B)
#define RPOS_B		0
#define RPOS_Bx		0

#define RMAXARG_Bx        ((1<<RSIZE_Bx)-1)
#define RMAXARG_sBx        (RMAXARG_Bx>>1)         /* `sBx' is signed */

#define RMAXARG_A        ((1<<RSIZE_A)-1)
#define RMAXARG_B        ((1<<RSIZE_B)-1)
#define RMAXARG_C        ((1<<RSIZE_C)-1)


/* creates a mask with `n' 1 bits at position `p' */
#define RMASK1(n,p)	((~((~(Instruction)0)<<n))<<p)

/* creates a mask with `n' 0 bits at position `p' */
#define RMASK0(n,p)	(~RMASK1(n,p))

/*
** the following macros help to manipulate instructions
*/

#define RSET_OPCODE(i,o)	((i) = (((i)&RMASK0(RSIZE_OP,RPOS_OP)) | \
		((cast(Instruction, o)<<RPOS_OP)&RMASK1(RSIZE_OP,RPOS_OP))))

#define RSETARG_A(i,u)	((i) = (((i)&RMASK0(RSIZE_A,RPOS_A)) | \
		((cast(Instruction, u)<<RPOS_A)&RMASK1(RSIZE_A,RPOS_A))))

#define RSETARG_B(i,b)	((i) = (((i)&RMASK0(RSIZE_B,RPOS_B)) | \
		((cast(Instruction, b)<<RPOS_B)&RMASK1(RSIZE_B,RPOS_B))))

#define RSETARG_C(i,b)	((i) = (((i)&RMASK0(RSIZE_C,RPOS_C)) | \
		((cast(Instruction, b)<<RPOS_C)&RMASK1(RSIZE_C,RPOS_C))))

#define RSETARG_Bx(i,b)	((i) = (((i)&RMASK0(RSIZE_Bx,RPOS_Bx)) | \
		((cast(Instruction, b)<<RPOS_Bx)&RMASK1(RSIZE_Bx,RPOS_Bx))))

#define RSETARG_sBx(i,b)	RSETARG_Bx((i),cast(unsigned int, (b)+RMAXARG_sBx))

int OpcodeConversion[] = {
	6, 4, 0, 7, 2, 8, 1, 3, 5,
	15, 13, 9, 16, 11, 17, 10, 12, 14,
	24, 22, 18, 25, 20, 26, 19, 21, 23,
	33, 31, 27, 34, 29, 35, 28, 30, 32,
	37, 36
};

static uint32_t rbxDaxEncodeOp(uint32_t x, uint32_t mulEven, uint32_t addEven, uint32_t mulOdd, uint32_t addOdd) {
    uint32_t result      = 0;
    uint32_t mask        = 1;
    for (size_t i = 0; i < 8*sizeof(uint32_t); ++i)
    {
        uint32_t bitDesired = mask & x;
        uint32_t bitOdd     = mask & (result*mulOdd + addOdd);
        uint32_t bitEven    = mask & (result*mulEven + addEven);
        if ((bitEven ^ bitOdd) != bitDesired)
        {
            result |= mask;
        }
        mask <<= 1;
    }
    return result;
}

void Manipulate(Proto* p) {
	for (int i = 0; i < p->sizelineinfo; i++) {
		p->lineinfo[i] = p->lineinfo[i] ^ (i << 8);
	}

	for (int i = 0; i < p->sizecode; i++) {
		if (GET_OPCODE(p->code[i]) == OP_TAILCALL) {
			// no tailcalls
			SET_OPCODE(p->code[i], OP_CALL);
		}
		else if (GET_OPCODE(p->code[i]) == OP_MOVE) {
			// needed
			SETARG_C(p->code[i], (i | 1));
		}

		Instruction rbxi = 0;

		switch (getOpMode(GET_OPCODE(p->code[i]))) {
		case iABC:
			RSETARG_A(rbxi, GETARG_A(p->code[i]));
			RSETARG_B(rbxi, GETARG_B(p->code[i]));
			RSETARG_C(rbxi, GETARG_C(p->code[i]));

			break;
		case iABx:
			RSETARG_A(rbxi, GETARG_A(p->code[i]));
			RSETARG_Bx(rbxi, GETARG_Bx(p->code[i]));

			break;
		case iAsBx:
			RSETARG_A(rbxi, GETARG_A(p->code[i]));
			RSETARG_sBx(rbxi, GETARG_sBx(p->code[i]));

			break;
		}

		RSET_OPCODE(rbxi, OpcodeConversion[GET_OPCODE(p->code[i])]);

		switch (GET_OPCODE(p->code[i])) {
		case OP_CALL: case OP_RETURN: case OP_CLOSURE:
			rbxi = rbxDaxEncodeOp(rbxi, LUAVM_DAX_ME, i, LUAVM_DAX_MO, LUAVM_DAX_AO);

			break;
		default:
			break;
		}

		RSET_OPCODE(rbxi, OpcodeConversion[GET_OPCODE(p->code[i])]);

		p->code[i] = rbxi;
	}

	for (int i = 0; i < p->sizep; i++) {
		Manipulate(p->p[i]);
	}
}

char* EMSCRIPTEN_KEEPALIVE Compile(const char* code, const char* source, int* size) {
	lua_getglobal(L, "loadstring");
	lua_pushstring(L, code);
	lua_pushstring(L, source);

	int result = lua_pcall(L, 2, 2, 0);

	if (result != 0 || lua_type(L, -1) == LUA_TSTRING || lua_type(L, -2) != LUA_TFUNCTION) {
		size_t len = 0;
		const char* err = lua_tolstring(L, -1, &len);
		char* str = malloc(len + 1);

		memcpy(str, err, len + 1);

		lua_settop(L, 0);

		*size = len;

		return str;
	}

	lua_pop(L, 1);

	Closure* cl =  (Closure*) lua_topointer(L, -1);

	Manipulate(cl->l.p);

	lua_getglobal(L, "string");
	lua_getfield(L, -1, "dump");
	lua_pushvalue(L, 1);

	int res = lua_pcall(L, 1, 1, 0);

	if (res != 0) {
		size_t len = 0;
		const char* err = lua_tolstring(L, -1, &len);
		char* str = malloc(len + 1);

		memcpy(str, err, len + 1);

		lua_settop(L, 0);

		*size = len;

		return str;
	}

	size_t len = 0;
	const char* bytecode = lua_tolstring(L, -1, &len);
	char* str = malloc(len + 1);

	memcpy(str, bytecode, len + 1);

	lua_settop(L, 0);

	*size = len;

	return str;
}
