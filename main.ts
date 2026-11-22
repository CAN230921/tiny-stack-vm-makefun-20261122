import fs from 'node:fs';

const widths = { 1: 1, 2: 4, 48: 2, 49: 2, 50: 2, 51: 2 };

export function run(code: Buffer, input: Buffer) {
  const stack = new Int32Array(256), memory = new Int32Array(256);
  const calls = [], output = [];
  let pc = 0, sp = 0, read = 0, imm = 0;

  const stop = exit => { throw exit; };
  const address = slot => slot >>> 8 ? stop(6) : slot;
  const divisor = value => value || stop(4);
  const emit = bytes => {
    if (output.length + bytes.length > 65536) throw 11;
    output.push(...bytes);
  };
  const call = () => {
    if (calls.length === 64) throw 7;
    calls.push(pc);
    pc = imm & 65535;
  };

  // Rows follow the opcode nibbles. Parameter count is the number of operands.
  const ops = [
    [
      () => stop(0), () => imm, () => imm, a => {},
      a => { sp++; return a; },
      (a, b) => { stack[sp++] = b; return a; },
      (a, b) => { sp += 2; return a; },
      (a, b, c) => { stack[sp++] = b; stack[sp++] = c; return a; },
    ],
    [
      (a, b) => a + b, (a, b) => a - b, Math.imul,
      (a, b) => a / divisor(b), (a, b) => a % divisor(b),
      (a, b) => (a >>> 0) / (divisor(b) >>> 0),
      (a, b) => (a >>> 0) % (divisor(b) >>> 0),
      a => -a,
      (a, b) => a & b, (a, b) => a | b, (a, b) => a ^ b, a => ~a,
      (a, b) => a << b, (a, b) => a >> b, (a, b) => a >>> b,
    ],
    [(a, b) => +(a === b), (a, b) => +(a < b), (a, b) => +((a >>> 0) < (b >>> 0))],
    [
      () => { pc += imm; },
      a => { if (!a) pc += imm; },
      a => { if (a) pc += imm; },
      call,
      () => { pc = calls.pop() ?? stop(8); },
    ],
    [a => memory[address(a)], (a, b) => { memory[address(b)] = a; }],
    [a => emit(Buffer.from(String(a))), a => emit([a]), () => input[read++] ?? -1, a => stop(a & 255)],
  ];

  try {
    for (let steps = 0; steps < 1e6; steps++) {
      const op = code[pc++] ?? stop(9);
      const execute = ops[op >>> 4]?.[op & 15] ?? stop(5);
      const width = widths[op];
      if (width) {
        pc += width;
        if (pc > code.length) throw 9;
        imm = code.readIntLE(pc - width, width);
      }
      const base = sp - execute.length;
      if (base < 0) throw 2;
      sp = base;
      const result = execute(stack[base], stack[base + 1], stack[base + 2]);
      if (result !== undefined) {
        if (sp === 256) throw 3;
        stack[sp++] = result;
      }
    }
    throw 10;
  } catch (exit) {
    if (typeof exit !== 'number') throw exit;
    return { exit, stdout: Buffer.from(output) };
  }
}

const { MAKEFUN_INPUT_DIR: input = '/input', MAKEFUN_OUTPUT_DIR: output = '/output' } = process.env;
for (const id of fs.readdirSync(input)) {
  const read = file => fs.readFileSync(`${input}/${id}/${file}.bin`);
  const { exit, stdout } = run(read('program'), read('input'));
  const dir = output + '/' + id;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + '/stdout.bin', stdout);
  fs.writeFileSync(dir + '/exit.txt', String(exit));
}
