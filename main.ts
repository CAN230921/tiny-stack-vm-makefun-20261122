import * as fs from 'node:fs';

type Operation = (a: number, b: number) => number;

const alu: (Operation | null)[] = [
  (a, b) => a + b, (a, b) => a - b, Math.imul,
  (a, b) => a / b, (a, b) => a % b,
  (a, b) => (a >>> 0) / (b >>> 0), (a, b) => (a >>> 0) % (b >>> 0),
  a => -a,
  (a, b) => a & b, (a, b) => a | b, (a, b) => a ^ b, a => ~a,
  (a, b) => a << b, (a, b) => a >> b, (a, b) => a >>> b,
  null,
  (a, b) => +(a === b), (a, b) => +(a < b), (a, b) => +((a >>> 0) < (b >>> 0)),
];

function stop(exit: number): never { throw exit; }

export function run(code: Buffer, input: Buffer) {
  const stack: number[] = [], calls: number[] = [];
  const memory = new Int32Array(256);
  const stdout = Buffer.allocUnsafe(65536);
  let pc = 0, read = 0, written = 0;
  const pop = () => stack.pop() ?? stop(2);
  const peek = (depth: number) => stack.at(-depth) ?? stop(2);
  const push = (value: number) => stack.length === 256 ? stop(3) : stack.push(value | 0);

  const next = (width: number) => {
    pc += width;
    if (pc > code.length) throw 9;
    return code.readIntLE(pc - width, width);
  };
  const rotate = (depth: number) => {
    const first = peek(depth);
    stack.copyWithin(-depth, 1 - depth);
    stack[stack.length - 1] = first;
  };
  const branch = (when?: boolean) => {
    const offset = next(2);
    if (when === undefined || when === !!pop()) pc += offset;
  };
  const call = () => {
    const dest = next(2) & 65535;
    if (calls.length === 64) throw 7;
    calls.push(pc);
    pc = dest;
  };
  const address = (index: number) => index >>> 8 ? stop(6) : index;
  const store = () => {
    const index = pop(), value = pop();
    memory[address(index)] = value;
  };
  const emit = (bytes: ArrayLike<number>) => {
    if (written + bytes.length > stdout.length) throw 11;
    stdout.set(bytes, written);
    written += bytes.length;
  };

  // Rows correspond to the high opcode nibble. Arithmetic shares one dispatch path.
  const groups = [
    [
      () => stop(0), () => push(next(1)), () => push(next(4)), pop,
      () => push(peek(1)), () => rotate(2), () => push(peek(2)), () => rotate(3),
    ],
    [], [],
    [branch, () => branch(false), () => branch(true), call, () => { pc = calls.pop() ?? stop(8); }],
    [() => push(memory[address(pop())]), store],
    [
      () => emit(Buffer.from(String(pop()))), () => emit([pop()]),
      () => push(input[read++] ?? -1), () => stop(pop() & 255),
    ],
  ];
  try {
    for (let step = 0; step < 1e6; step++) {
      const op = code[pc++] ?? stop(9);
      const calculate = op >= 0x10 && op <= 0x22 && alu[op - 0x10];
      if (calculate) {
        const b = op === 0x17 || op === 0x1b ? 0 : pop();
        const a = pop();
        if (op >= 0x13 && op <= 0x16 && b === 0) throw 4;
        push(calculate(a, b));
      } else {
        const handler = groups[op >>> 4]?.[op & 15] ?? stop(5);
        handler();
      }
    }
    throw 10;
  } catch (exit) {
    if (typeof exit !== 'number') throw exit;
    return { exit, stdout: stdout.subarray(0, written) };
  }
}

const { MAKEFUN_INPUT_DIR: inputDir = '/input', MAKEFUN_OUTPUT_DIR: outputDir = '/output' } = process.env;
for (const id of fs.readdirSync(inputDir)) {
  const read = (file: string) => fs.readFileSync(`${inputDir}/${id}/${file}.bin`);
  const { exit, stdout } = run(read('program'), read('input'));
  const dir = outputDir + '/' + id;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + '/stdout.bin', stdout);
  fs.writeFileSync(dir + '/exit.txt', String(exit));
}
