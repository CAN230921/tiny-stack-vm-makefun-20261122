import fs from 'fs';

// Pop count, then fixed JS.
const isa = `0trap(0)
0read(1)
0read(4)
1void 0
1[a,a]
2[b,a]
2[a,b,a]
3[b,c,a]

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

0void(pc+=imm)
1void(pc+=a?0:imm)
1void(pc+=a?imm:0)
0calls.length===64?trap(7):void(calls.push(pc),pc=imm&65535)
0void(pc=calls.pop()??trap(8))

1ram[addr(a)]??0
2void(ram[addr(b)]=a)

1emit(''+a)
1emit(String.fromCharCode(a&255))
0input[pos++]??-1
1trap(a&255)`;

export function run(code,input) {
	const stack=[], calls=[], ram=[];
	let pc=0, pos=0, imm, out='';
	const trap = n => { throw n; };
	const addr = n => n>>8 ? trap(6) : n;
	const div = b => b||trap(4);
	const read = n => {
		pc+=n;
		if (pc>code.length) throw 9;
		return code.readIntLE(pc-n,n);
	};
	const emit = text => void (out.length+text.length>65536 ? trap(11) : out+=text);
	const ops = isa.split('\n\n').map(row=>row.split('\n').map(line=>
		eval(`(${'a,b,c,'.slice(0,line[0]*2)})=>${line.slice(1)}`)));
	try {
		for (let fuel=1e6; fuel--; ) {
			const op = code[pc++]??trap(9);
			const step = ops[op>>4]?.[op&15]??trap(5);
			if (op>>2===12) imm=read(2);
			const base=stack.length-step.length;
			if (base<0) throw 2;
			const value=step(...stack.splice(base).map(n=>n|0));
			stack.push(...[].concat(value??[]));
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
