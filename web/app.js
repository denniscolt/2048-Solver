// Simple 2048 + Expectimax in the browser (configurable start)
class RNG { constructor(seed){ this.s = seed ?? Math.floor(Math.random()*2**31); }
  next(){ let x = this.s|0; x ^= x<<13; x ^= x>>>17; x ^= x<<5; this.s = x|0; return (x>>>0)/2**32; } }

const MOVES = ["U","D","L","R"]; const SIZE = 4;

function newBoard(){ return Array.from({length:4},()=>[0,0,0,0]); }
function emptyCells(g){ const out=[]; for(let r=0;r<4;r++) for(let c=0;c<4;c++) if(!g[r][c]) out.push([r,c]); return out; }
function clone(g){ return g.map(r=>r.slice()); }

function compressRowLeft(row){
  const tiles=row.filter(x=>x!==0);
  const out=[]; let score=0;
  for(let i=0;i<tiles.length;i++){
    if(i+1<tiles.length && tiles[i]===tiles[i+1]){ const m=tiles[i]*2; out.push(m); score+=m; i++; }
    else out.push(tiles[i]);
  }
  while(out.length<4) out.push(0);
  const moved = out.some((v,i)=>v!==row[i]);
  return [out,score,moved];
}
function moveLeft(g){
  let sc=0,mv=false;
  const n=g.map(r=>{ const [nr,add,m]=compressRowLeft(r); sc+=add; mv=mv||m; return nr; });
  return [n,sc,mv];
}
function reverseRows(g){ return g.map(r=>r.slice().reverse()); }
function transpose(g){ return g[0].map((_,c)=>g.map(r=>r[c])); }
function moveRight(g){ const [n,sc,mv]=moveLeft(reverseRows(g)); return [reverseRows(n),sc,mv]; }
function moveUp(g){ const [n,sc,mv]=moveLeft(transpose(g)); return [transpose(n),sc,mv]; }
function moveDown(g){ const [n,sc,mv]=moveRight(transpose(g)); return [transpose(n),sc,mv]; }
const MOVE_FUNS={L:moveLeft,R:moveRight,U:moveUp,D:moveDown};

function canMove(g){
  if(emptyCells(g).length) return true;
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const v=g[r][c];
    if(r+1<4 && g[r+1][c]===v) return true;
    if(c+1<4 && g[r][c+1]===v) return true;
  }
  return false;
}
function spawn(g,rng){
  const cells=emptyCells(g);
  if(!cells.length) return false;
  const [r,c]=cells[Math.floor(rng.next()*cells.length)];
  g[r][c] = rng.next()<0.1?4:2;
  return true;
}

// ---- Heuristic
const gradients={
  TL:[[15,14,13,12],[11,10,9,8],[7,6,5,4],[3,2,1,0]],
  TR:[[12,13,14,15],[8,9,10,11],[4,5,6,7],[0,1,2,3]],
  BL:[[3,2,1,0],[7,6,5,4],[11,10,9,8],[15,14,13,12]],
  BR:[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],
};
const W={ empty:270, mono:47, smooth:0.3, corner:1000 };
function hscore(g, corner){
  const empty=emptyCells(g).length;
  let smooth=0;
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const v=g[r][c]; if(!v) continue;
    const lv=Math.log2(v);
    if(r+1<4 && g[r+1][c]) smooth -= Math.abs(lv-Math.log2(g[r+1][c]));
    if(c+1<4 && g[r][c+1]) smooth -= Math.abs(lv-Math.log2(g[r][c+1]));
  }
  const grad=gradients[corner]||gradients.BL;
  let mono=0;
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const v=g[r][c]; if(v) mono += grad[r][c]*Math.log2(v);
  }
  const corners={TL:[0,0],TR:[0,3],BL:[3,0],BR:[3,3]};
  const [cr,cc]=corners[corner]||[3,0];
  const maxTile=Math.max(0,...g.flat());
  const bonus=(maxTile && g[cr][cc]===maxTile)?W.corner:0;
  return W.empty*empty + W.mono*mono + W.smooth*smooth + bonus;
}

// ---- Expectimax
function bestMove(g, depth, corner){
  let best="L", val=-Infinity;
  for(const m of MOVES){
    const [g2,_,moved]=MOVE_FUNS[m](g);
    if(!moved) continue;
    const v=expVal(g2, depth-1, corner);
    if(v>val){ val=v; best=m; }
  }
  return [best,val];
}
function maxVal(g, depth, corner){
  if(depth===0 || !canMove(g)) return hscore(g,corner);
  let v=-Infinity;
  for(const m of MOVES){
    const [g2,_,moved]=MOVE_FUNS[m](g);
    if(!moved) continue;
    v=Math.max(v, expVal(g2, depth-1, corner));
  }
  return v===-Infinity? hscore(g,corner):v;
}
function expVal(g, depth, corner){
  const cells=emptyCells(g);
  if(depth===0 || !cells.length) return hscore(g,corner);
  let total=0;
  const pcell=1/cells.length, p2=0.9, p4=0.1;
  for(const [r,c] of cells){
    const g2=clone(g); g2[r][c]=2;
    total += pcell*p2*maxVal(g2, depth-1, corner);
    const g4=clone(g); g4[r][c]=4;
    total += pcell*p4*maxVal(g4, depth-1, corner);
  }
  return total;
}

// ---- UI
const ui={
  elBoard: document.getElementById('board'),
  elScore: document.getElementById('score'),
  elMoves: document.getElementById('moves'),
  elStatus: document.getElementById('status'),
  elStartCsv: document.getElementById('startCsv'),
  elCorner: document.getElementById('corner'),
  elDepth: document.getElementById('depth'),
  elSeed: document.getElementById('seed'),
  btnNew: document.getElementById('btnNew'),
  btnStep: document.getElementById('btnStep'),
  btnAuto: document.getElementById('btnAuto'),
  btnStop: document.getElementById('btnStop'),
};

let state={ g:newBoard(), score:0, moves:0, rng:new RNG(), timer:null };

function parseCsv(csv){
  if(!csv) return null;
  const vals=csv.split(/[;,]/).map(s=>s.trim()).filter(s=>s.length).map(Number);
  if(vals.length!==16 || vals.some(v=>Number.isNaN(v))) return null;
  const grid=[]; for(let i=0;i<4;i++) grid.push(vals.slice(i*4,(i+1)*4));
  return grid;
}

function reset(){
  const csv=ui.elStartCsv.value;
  const start=parseCsv(csv);
  const seedVal=parseInt(ui.elSeed.value,10);
  state.rng=new RNG(Number.isFinite(seedVal)?seedVal:undefined);
  state.g = start? clone(start): newBoard();
  let existing = 16 - emptyCells(state.g).length;
  while(existing<2){ if(!spawn(state.g, state.rng)) break; existing++; }
  state.score=0; state.moves=0;
  draw(); setStatus('ready');
}

function draw(){
  ui.elBoard.innerHTML='';
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const v=state.g[r][c];
    const d=document.createElement('div');
    d.className='cell v'+(v||0);
    d.textContent=v||'';
    ui.elBoard.appendChild(d);
  }
  ui.elScore.textContent=state.score;
  ui.elMoves.textContent=state.moves;
}
function setStatus(s){ ui.elStatus.textContent=s; }

function step(){
  if(!canMove(state.g)){ setStatus('game over'); return; }
  const depth=Math.max(1, Math.min(8, parseInt(ui.elDepth.value,10)||4));
  const corner=ui.elCorner.value||'BL';
  const [mv]=bestMove(state.g, depth, corner);
  const [g2,sc,moved]=MOVE_FUNS[mv](state.g);
  if(!moved){ setStatus('no-op, trying next'); return; }
  state.g=g2; state.score+=sc; state.moves++;
  spawn(state.g, state.rng);
  draw();
}

function auto(){
  if(state.timer) return;
  setStatus('autoplay');
  state.timer=setInterval(()=>{
    if(!canMove(state.g)){ stop(); setStatus('done'); return; }
    step();
  }, 50);
}
function stop(){ if(state.timer){ clearInterval(state.timer); state.timer=null; setStatus('stopped'); } }

ui.btnNew.onclick=()=>{ stop(); reset(); };
ui.btnStep.onclick=()=> step();
ui.btnAuto.onclick=()=> auto();
ui.btnStop.onclick=()=> stop();

// Keyboard support
window.addEventListener('keydown', (e)=>{
  const map={ArrowUp:"U",ArrowDown:"D",ArrowLeft:"L",ArrowRight:"R"};
  const mv=map[e.key]; if(!mv) return;
  const [g2,sc,moved]=MOVE_FUNS[mv](state.g);
  if(!moved) return;
  state.g=g2; state.score+=sc; state.moves++;
  spawn(state.g, state.rng);
  draw();
});

reset();
