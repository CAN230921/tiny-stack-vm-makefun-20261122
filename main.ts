import fs from 'node:fs';

const widths = { 1: 1, 2: 4, 48: 2, 49: 2, 50: 2, 51: 2 };

export function run(code, input) {
	const words = new Int32Array(512);
	const calls = [];
	let pc = 0, sp = 0, read = 0, imm = 0, op, output = '';

	const stop = exit => { throw exit; };
	const address = slot => slot >>> 8 ? stop(6) : 256 + slot;
	const divide = (a, b) => {
		if (!b) throw 4;
		if (op >= 0x15) {
			a >>>= 0;
			b >>>= 0;
		}
		return op & 1 ? a / b : a % b;
	};
	const emit = text => {
		if (output.length + text.length > 65536) throw 11;
		output += text;
	};

	// Rows follow the opcode nibbles. Parameter count is the number of operands.
	const ops = [
		[
			() => stop(0), () => imm, () => imm, a => {},
			a => { sp++; return a; },
			(a, b) => { words[sp++] = b; return a; },
			(a, b) => { sp += 2; return a; },
			(a, b, c) => { words[sp++] = b; words[sp++] = c; return a; },
		],
		[
			(a, b) => a + b, (a, b) => a - b, Math.imul,
			divide, divide, divide, divide,
			a => -a,
			(a, b) => a & b, (a, b) => a | b, (a, b) => a ^ b, a => ~a,
			(a, b) => a << b, (a, b) => a >> b, (a, b) => a >>> b,
		],
		[(a, b) => a === b, (a, b) => a < b, (a, b) => (a >>> 0) < (b >>> 0)],
		[
			() => { pc += imm; },
			a => { if (!a) pc += imm; },
			a => { if (a) pc += imm; },
			() => {
				if (calls.length === 64) throw 7;
				calls.push(pc);
				pc = imm & 65535;
			},
			() => { pc = calls.pop() ?? stop(8); },
		],
		[a => words[address(a)], (a, b) => { words[address(b)] = a; }],
		[a => emit(String(a)), a => emit(String.fromCharCode(a & 255)), () => input[read++] ?? -1, a => stop(a & 255)],
	];

	try {
		for (let fuel = 1e6; fuel--; ) {
			op = code[pc++] ?? stop(9);
			const execute = ops[op >>> 4]?.[op & 15] ?? stop(5);
			const width = widths[op];
			if (width) {
				pc += width;
				if (pc > code.length) throw 9;
				imm = code.readIntLE(pc - width, width);
			}
			sp -= execute.length;
			if (sp < 0) throw 2;
			const result = execute(words[sp], words[sp + 1], words[sp + 2]);
			if (result === undefined) continue;
			if (sp === 256) throw 3;
			words[sp++] = result;
		}
		throw 10;
	} catch (exit) {
		if (typeof exit !== 'number') throw exit;
		return { exit, stdout: Buffer.from(output, 'latin1') };
	}
}

const { MAKEFUN_INPUT_DIR: input = '/input', MAKEFUN_OUTPUT_DIR: output = '/output' } = process.env;
for (const id of fs.readdirSync(input)) {
	const read = file => fs.readFileSync(`${input}/${id}/${file}.bin`);
	const { exit, stdout } = run(read('program'), read('input'));
	const dir = output + '/' + id;
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(dir + '/stdout.bin', stdout);
	fs.writeFileSync(dir + '/exit.txt', '' + exit);
}
