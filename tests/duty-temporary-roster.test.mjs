import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import policy from '../netlify/duty-grade-policy.cjs';

const auto=readFileSync(new URL('../board-duty-auto-test.js',import.meta.url),'utf8');
const roster=readFileSync(new URL('../board-duty-roster.js',import.meta.url),'utf8');
const board=readFileSync(new URL('../board.html',import.meta.url),'utf8');
const site=readFileSync(new URL('../netlify/functions/site-data.mjs',import.meta.url),'utf8');

test('temporary duty builder creates a real saved roster path instead of a placeholder',()=>{
  for(const token of ['initTemporaryDuty','temporaryDutyCreateBtn','confirmTemporaryDutyRosters','temporary:true','この臨時当番表を確定'])assert(auto.includes(token)||roster.includes(token),token);
  assert(!auto.includes('画像生成・確定保存は次の段階で接続します'));
});

test('manual image registration stays folded below the temporary builder',()=>{
  const temporary=board.indexOf('id="temporaryDutyCreateBtn"'),manual=board.indexOf('>画像を手動登録<');
  assert(temporary>=0&&manual>temporary);
  assert.match(board,/class="duty-manual-upload"/);
  assert.match(board,/board-duty-roster\.js\?v=20261103-temp-roster1/);
  assert.match(board,/duty-grade-policy\.js\?v=20261103-temp-roster1/);
});

test('temporary one-grade table is accepted while a normal one-grade table remains invalid',()=>{
  const temp={year:2027,month:8,grades:[1],activityDays:[],rows:[[5,'木','山田','佐藤']],temporary:true,slots:{5:'午前'}};
  const normal={...temp,temporary:false};
  assert.equal(policy.validTable(temp),true);
  assert.equal(policy.validTable(normal),false);
  const start=site.indexOf('      const valid = images.every(item => {'),end=site.indexOf('      if (!valid) {',start);
  assert(start>=0&&end>start);
  const block=site.slice(start,end);
  for(const [table,expected] of [[structuredClone(temp),true],[structuredClone(normal),false]]){
    const context={images:[{name:'test.png',data:'data:image/png;base64,AA==',table}]};
    vm.runInNewContext(block+'\nthis.accepted=valid;',context);
    assert.equal(context.accepted,expected);
  }
});

test('normal monthly replacement explicitly ignores temporary same-month rosters',()=>{
  assert.match(roster,/sameIndex=images\.findIndex\(function\(item\)\{return item\.table&&item\.table\.temporary!==true/);
  assert.match(roster,/window\.confirmTemporaryDutyRosters=confirmTemporaryDutyRosters/);
  assert.match(roster,/item\.table&&item\.table\.temporary!==true&&item\.table\.year===table\.year/);
});
