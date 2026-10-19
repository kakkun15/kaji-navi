const GAME=require('../src/game.js'); const {scripted,seeded}=require('./scripted.js');
const G=GAME.setup({item:process.argv[2]||'lamp',level:75,hammer:'hikari',star:3,focus:242});
const r=seeded(5); const s=GAME.newState(G), ideal=G.cells.map(z=>z?z[0]+Math.floor(r()*(z[1]-z[0]+1)):null);
for(let k=0;k<80&&!s.dead;k++){const a=scripted(G,s); if(!a){console.log('stop');break;} const c=GAME.costOf(G,s,a.t); const o=GAME.play(G,s,a,ideal,r); console.log(a.t.name,a.tg.join(','),'c',c,'->',s.temp,s.F,JSON.stringify(s.v),o.map(x=>x.crit?'C':'').join(''));}
console.log(JSON.stringify(GAME.judge(G,s,ideal)), ideal);
