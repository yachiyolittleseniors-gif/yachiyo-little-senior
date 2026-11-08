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
