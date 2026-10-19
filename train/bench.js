const GAME=require('../src/game.js'), V=require('../src/value.js');
function seeded(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd=seeded(1);
for(const item of ['lamp','hidane','hammer','pan']){
 const G=GAME.setup({item,level:75,hammer:'hikari',star:3,focus:242});
 const net=V.makeNet([V.featLen(G),64,64,1],rnd);
 const s=GAME.newState(G);
 const opt={K:12,rnd,buf:new Float32Array(V.featLen(G))};
 let t0=Date.now(), n=0;
 // play random game, timing evalActs
 const ideal=G.cells.map(z=>z?z[0]+Math.floor(rnd()*(z[1]-z[0]+1)):null);
 let st=s;
 for(let step=0;step<40;step++){ const qs=V.evalActs(net,G,st,opt); n++; const acts=qs.filter(x=>x.a); if(!acts.length)break; const a=acts[Math.floor(rnd()*acts.length)].a; GAME.play(G,st,a,ideal,rnd); if(Array.isArray(st.lit)) st.lit=st.lit[0]; if(st.dead)break; }
 console.log(item, G.acts.length,'acts', ((Date.now()-t0)/n).toFixed(1),'ms/decision', n);
}
