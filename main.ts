import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

type Binary = (left: number, right: number) => number;
// One slot per opcode starting at ADD (0x10). Unary and unused slots stay empty.
const binary: (Binary | null)[] = [
  (a, b) => a + b,
  (a, b) => a - b,
  Math.imul,
  (a, b) => a / b,
  (a, b) => a % b,
  (a, b) => (a >>> 0) / (b >>> 0),
  (a, b) => (a >>> 0) % (b >>> 0),
  null,
  (a, b) => a & b,
  (a, b) => a | b,
  (a, b) => a ^ b,
  null,
  (a, b) => a << b,
  (a, b) => a >> b,
  (a, b) => a >>> b,
  null,
  (a, b) => +(a === b),
  (a, b) => +(a < b),
  (a, b) => +((a >>> 0) < (b >>> 0)),
];

function address(value: number) {
  if (value >>> 8) throw 6;
  return value;
}

export function run(code: Buffer, input: Buffer) {
  const stack = new Int32Array(256);
  const memory = new Int32Array(256);
  const returns = new Uint16Array(64);
  const output = Buffer.allocUnsafe(65536);
  let pc = 0, depth = 0, calls = 0, read = 0, written = 0;

  function peek(distance: number) {
    if (depth < distance) throw 2;
    return stack[depth - distance];
  }

  function pop() {
    if (!depth) throw 2;
    return stack[--depth];
  }

  function push(value: number) {
    if (depth === 256) throw 3;
    stack[depth++] = value;
  }

  function immediate(width: number, signed = true) {
    if (pc + width > code.length) throw 9;
    const value = signed ? code.readIntLE(pc, width) : code.readUIntLE(pc, width);
    pc += width;
    return value;
  }

  function result(exit: number) {
    return { exit, stdout: output.subarray(0, written) };
  }

  try {
    for (let step = 0; step < 1000000; step++) {
      if (pc < 0 || pc >= code.length) throw 9;
      const op = code[pc++];
      switch (op) {
        case 0x00: return result(0);
        case 0x01: push(immediate(1)); break;
        case 0x02: push(immediate(4)); break;
        case 0x03: pop(); break;
        case 0x04: push(peek(1)); break;
        case 0x05: {
          const b = pop(), a = pop();
          push(b);
          push(a);
          break;
        }
        case 0x06: push(peek(2)); break;
        case 0x07: {
          const c = pop(), b = pop(), a = pop();
          push(b);
          push(c);
          push(a);
          break;
        }
        case 0x17: push(-pop()); break;
        case 0x1b: push(~pop()); break;
        case 0x30:
        case 0x31:
        case 0x32: {
          const delta = immediate(2);
          if (op === 0x30 || Boolean(pop()) === (op === 0x32)) pc += delta;
          break;
        }
        case 0x33: {
          const dest = immediate(2, false);
          if (calls === 64) throw 7;
          returns[calls++] = pc;
          pc = dest;
          break;
        }
        case 0x34:
          if (!calls) throw 8;
          pc = returns[--calls];
          break;
        case 0x40: push(memory[address(pop())]); break;
        case 0x41: {
          const addr = pop(), value = pop();
          memory[address(addr)] = value;
          break;
        }
        case 0x50: {
          const digits = String(pop());
          if (written + digits.length > output.length) throw 11;
          written += output.write(digits, written, 'ascii');
          break;
        }
        case 0x51: {
          const value = pop();
          if (written === output.length) throw 11;
          output[written++] = value;
          break;
        }
        case 0x52: push(read < input.length ? input[read++] : -1); break;
        case 0x53: return result(pop() & 255);
        default: {
          const operation = binary[op - 0x10];
          if (!operation) throw 5;
          const b = pop(), a = pop();
          if (op >= 0x13 && op <= 0x16 && b === 0) throw 4;
          push(operation(a, b));
        }
      }
    }
    return result(10);
  } catch (error) {
    if (typeof error !== 'number') throw error;
    return result(error);
  }
}

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(inputDir)) {
  const dir = `${inputDir}/${id}`;
  const { stdout, exit } = run(readFileSync(`${dir}/program.bin`), readFileSync(`${dir}/input.bin`));
  const destination = `${outputDir}/${id}`;
  mkdirSync(destination, { recursive: true });
  writeFileSync(`${destination}/stdout.bin`, stdout);
  writeFileSync(`${destination}/exit.txt`, String(exit));
}
