import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const front = readFileSync(new URL('../board-live-score.js', import.meta.url),'utf8');
const back = readFileSync(new URL('../netlify/functions/site-data.mjs', import.meta.url),'utf8');
const fn = (source,name,indent='') => source.match(new RegExp(`^${indent}function ${name}\\b[\\s\\S]*?^${indent}\\}`, 'm'))[0];
const ctx = vm.createContext({});
vm.runInContext([fn(front,'score','  '),fn(front,'normalizeGame','  '),fn(back,'normalizeLiveScoreNumber'),fn(back,'normalizeLiveScoreText'),fn(back,'normalizeLiveScoreGame'),fn(front,'phase','  ')].join('\n'),ctx);
const copy = x => JSON.parse(JSON.stringify(x));
test('new match fields survive a server/browser round trip and default on legacy data',()=>{
  const legacy=ctx.normalizeGame({});
  assert.equal(legacy.batter,1);assert.equal(legacy.dh,'none');assert.equal(legacy.commentary.length,0);
  const g={...legacy,batter:9,dh:'released',commentary:[{id:'one',text:'DH解除',context:'2回裏｜八千代',at:'2026-11-08T03:00:00Z',dhRelease:true}]};
  assert.deepEqual(copy(ctx.normalizeGame(ctx.normalizeLiveScoreGame(g))),copy(g));
});
test('malformed and oversize new fields are bounded at both boundaries',()=>{
  const g={batter:100.5,dh:'invalid',commentary:Array(400).fill({text:'あ'.repeat(100),context:'い'.repeat(200)})};
  for(const norm of [ctx.normalizeGame,ctx.normalizeLiveScoreGame]){
    const r=norm(g);assert.equal(r.batter,9);assert.equal(r.dh,'none');assert.equal(r.commentary.length,300);assert.equal(r.commentary[0].text.length,80);assert.equal(r.commentary[0].context.length,100);
  }
});
test('phase follows first/second batting order and supports tie breaks',()=>{
  assert.deepEqual(copy(ctx.phase({battingOrder:'second'})),{side:'opponent',inning:1,label:'1回表'});
  assert.equal(ctx.phase({battingOrder:'second',selectedScoreCell:{side:'ours',index:1,tieBreak:false}}).label,'2回裏');
  assert.equal(ctx.phase({battingOrder:'first',selectedScoreCell:{side:'ours',index:2,tieBreak:true}}).label,'10回表');
});

vm.runInContext([fn(front,'completesPlateAppearance','  '),fn(front,'undoCommentary','  '),fn(front,'commentaryContext','  '),fn(front,'postCommentary','  ')].join('\n'),ctx);
const init = (batter=3,side='ours') => {
  Object.assign(ctx,{inputMode:true,replayMode:false,closeExtraDialog(){},commitExtraChange(){},state:{active:true,current:ctx.normalizeGame({batter,battingOrder:'first',selectedScoreCell:{side,index:0,tieBreak:false}})}});
};
test('hits, batter outs and walks advance once, with the original batter in history',()=>{
  for(const text of ['ヒット！','ホームラン！','三振','ゴロ','フライ','ダブルプレー','四球で出塁！']){
    init(9); ctx.postCommentary(text,false,ctx.completesPlateAppearance(text));
    assert.equal(ctx.state.current.batter,1);
    const entry=ctx.state.current.commentary[0];assert.match(entry.context,/9番/);assert.equal(entry.batterBefore,9);
    assert.equal(ctx.state.current.sbo.outs,0);assert.equal(ctx.state.current.sbo.balls,0);
    // Undo still works after persistence and reload.
    const saved=ctx.normalizeGame(ctx.normalizeLiveScoreGame(ctx.state.current));
    ctx.undoCommentary(saved);assert.equal(saved.batter,9);assert.equal(saved.commentary.length,0);
  }
});
test('runner events, match notices, free text and opponent results keep our batter',()=>{
  for(const text of ['盗塁成功！','盗塁失敗','牽制アウト','先制！','同点！','DH解除','雨天中断']){
    init();ctx.postCommentary(text,false,ctx.completesPlateAppearance(text));assert.equal(ctx.state.current.batter,3);
  }
  init();ctx.postCommentary('ヒット！');assert.equal(ctx.state.current.batter,3,'free text does not infer outcomes');
  init(3,'opponent');ctx.postCommentary('三振',false,true);assert.equal(ctx.state.current.batter,3);assert.doesNotMatch(ctx.state.current.commentary[0].context,/3番/);
});
test('undo does not erase a later manual batter correction and viewers cannot post',()=>{
  init();ctx.postCommentary('ヒット！',false,true);ctx.state.current.batter=7;ctx.undoCommentary(ctx.state.current);assert.equal(ctx.state.current.batter,7);
  init();ctx.inputMode=false;ctx.postCommentary('ヒット！',false,true);assert.equal(ctx.state.current.batter,3);assert.equal(ctx.state.current.commentary.length,0);
});

vm.runInContext(fn(front,'clearBatterUndo','  '),ctx);
test('manual correction back to the same batter cannot revive an old auto-advance undo',()=>{
  init(3);ctx.postCommentary('ヒット！',false,true);
  ctx.clearBatterUndo(ctx.state.current);ctx.state.current.batter=5;
  ctx.clearBatterUndo(ctx.state.current);ctx.state.current.batter=4;
  const persisted=ctx.normalizeGame(ctx.normalizeLiveScoreGame(ctx.state.current));
  ctx.undoCommentary(persisted);assert.equal(persisted.batter,4);assert.equal(persisted.commentary.length,0);
});
