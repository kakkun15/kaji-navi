// 1局の打ち方を表示。node show.js <商材> <重み> <種>
const fs=require('fs'),GAME=require('../src/game.js'),V=require('../src/value.js');const {seeded}=require('./scripted.js');
const [item,wfile,SEED=1]=process.argv.slice(2);
const G=GAME.setup({item,level:75,hammer:'hikari',star:3,focus:242});
const j=JSON.parse(fs.readFileSync(wfile));const net={sizes:j.sizes,L:j.L.map(l=>({n:l.n,m:l.m,W:Float32Array.from(l.W),b:Float32Array.from(l.b)}))};net.ver=j.sizes[0]===V.featLen(G,1)?1:2;
const r=seeded(+SEED);const s=GAME.newState(G),ideal=G.cells.map(z=>z?z[0]+Math.floor(r()*(z[1]-z[0]+1)):null);
console.log('ideal',ideal.join(','));
const opt={K:12,rnd:seeded(5),buf:new Float32Array(V.featLen(G,net.ver))};
for(let k=0;k<80&&!s.dead;k++){const qs=V.evalActs(net,G,s,opt);const best=qs.reduce((a,b)=>b.q>a.q?b:a);
 const top=qs.slice().sort((a,b)=>b.q-a.q).slice(0,3).map(x=>(x.a?x.a.t.name+x.a.tg.join(''):'やめる')+' '+x.q.toFixed(3)).join(' | ');
 if(!best.a){console.log(`${s.temp}℃ F${s.F} stop ${GAME.stopProb(G,s).toFixed(3)}`);break;}
 const c=GAME.costOf(G,s,best.a.t);const t0=s.temp;const o=GAME.play(G,s,best.a,ideal,r);
 console.log(`${t0}℃ F${s.F+c} ${best.a.t.name}${best.a.tg.join('')} -> [${s.v.join(',')}] ${o.map(x=>x.crit?'会心':'').join('')}  候補: ${top}`);}
console.log(JSON.stringify(GAME.judge(G,s,ideal)));
