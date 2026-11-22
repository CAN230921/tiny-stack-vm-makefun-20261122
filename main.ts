import fs from 'fs';

// Pop count + fixed JS per opcode.
const isa = `0trap(0)
0imm
0imm
1void 0
1(stack.push(a), a)
2(stack.push(b), a)
2(stack.push(a,b), a)
3(stack.push(b,c), a)

2a+b
2a-b
2Math.imul(a,b)
2a/div(b)
2a%div(b)
2(a>>>0)/(div(b)>>>0)
2(a>>>0)%(div(b)>>>0)
1-a
2a&b
2a|b
2a^b
1~a
2a<<b
2a>>b
2a>>>b

2a===b
2a<b
2(a>>>0)<(b>>>0)

0void (pc+=imm)
1void (a || (pc+=imm))
1void (a && (pc+=imm))
0calls.length===64 ? trap(7) : void (calls.push(pc),pc=imm&65535)
0void (pc=calls.pop()??trap(8))

1ram[addr(a)]??0
2void (ram[addr(b)]=a)

1emit(String(a))
1emit(String.fromCharCode(a&255))
0input[pos++]??-1
1trap(a&255)`;

export function run(code,input) {
	const stack=[], calls=[], ram=[];
	let pc=0, pos=0, op, imm, out='';
	const trap = n => { throw n; };
	const addr = n => n>>8 ? trap(6) : n;
	const div = b => b||trap(4);
	const emit = text => void (out.length+text.length>65536 ? trap(11) : out+=text);
	const ops = isa.split('\n\n').map(row=>row.split('\n').map(line=>
		eval(`(${'a,b,c,'.slice(0,line[0]*2)})=>${line.slice(1)}`)));
	try {
		for (let fuel=1e6; fuel--; ) {
			op = code[pc++]??trap(9);
			const step = ops[op>>4]?.[op&15]??trap(5);
			const width = op<3 ? [0,1,4][op] : op>>2===12 ? 2 : 0;
			if (width) {
				pc+=width;
				if (pc>code.length) throw 9;
				imm=code.readIntLE(pc-width,width);
			}
			const base=stack.length-step.length;
			if (base<0) throw 2;
			const value=step(...stack.splice(base));
			if (value!==undefined) stack.push(value|0);
			if (stack.length>256) throw 3;
		}
		throw 10;
	} catch (exit) {
		if (typeof exit!=='number') throw exit;
		return { exit, stdout: Buffer.from(out,'latin1') };
	}
}

if (import.meta.main) for (const id of fs.readdirSync('/input')) {
	const read = name => fs.readFileSync('/input/'+id+'/'+name+'.bin');
	const {exit,stdout}=run(read('program'),read('input'));
	const dir='/output/'+id;
	fs.mkdirSync(dir);
	fs.writeFileSync(dir+'/stdout.bin',stdout);
	fs.writeFileSync(dir+'/exit.txt',''+exit);
}
