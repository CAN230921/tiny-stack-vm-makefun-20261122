import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

export function run(code: Buffer, input: Buffer) {
  const stack = new Int32Array(256);
  const memory = new Int32Array(256);
  const returns = new Uint16Array(64);
  const output = Buffer.allocUnsafe(65536);
  let pc = 0, depth = 0, calls = 0, read = 0, written = 0;

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

  function address() {
    const value = pop();
    if (value >>> 8) throw 6;
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
        case 0x04: {
          const a = pop();
          push(a);
          push(a);
          break;
        }
        case 0x05: {
          const b = pop(), a = pop();
          push(b);
          push(a);
          break;
        }
        case 0x06: {
          const b = pop(), a = pop();
          push(a);
          push(b);
          push(a);
          break;
        }
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
        case 0x40: push(memory[address()]); break;
        case 0x41: {
          const addr = pop(), value = pop();
          if (addr >>> 8) throw 6;
          memory[addr] = value;
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
        case 0x52: push(input[read] ?? -1); read++; break;
        case 0x53: return result(pop() & 255);
        default: {
          if (op < 0x10 || op > 0x22 || op === 0x1f) throw 5;
          const b = pop(), a = pop();
          if (op >= 0x13 && op <= 0x16 && b === 0) throw 4;
          switch (op) {
            case 0x10: push(a + b); break;
            case 0x11: push(a - b); break;
            case 0x12: push(Math.imul(a, b)); break;
            case 0x13: push(a / b); break;
            case 0x14: push(a % b); break;
            case 0x15: push((a >>> 0) / (b >>> 0)); break;
            case 0x16: push((a >>> 0) % (b >>> 0)); break;
            case 0x18: push(a & b); break;
            case 0x19: push(a | b); break;
            case 0x1a: push(a ^ b); break;
            case 0x1c: push(a << b); break;
            case 0x1d: push(a >> b); break;
            case 0x1e: push(a >>> b); break;
            case 0x20: push(+(a === b)); break;
            case 0x21: push(+(a < b)); break;
            case 0x22: push(+((a >>> 0) < (b >>> 0))); break;
          }
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
