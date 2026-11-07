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

test('temporary duty date input uses a normal label instead of an overlaid iPhone placeholder',()=>{
  assert.match(auto,/tmp-field-label">日付/);
  assert.doesNotMatch(auto,/tmp-date-placeholder/);
  assert.match(board,/temporary-duty-ios-and-multigrade-fix/);
  assert.match(board,/\.tmp-date\{[\s\S]*?height:52px!important/);
  assert.match(board,/line-height:normal!important/);
});

test('temporary duty supports multiple grades and two names per selected grade',()=>{
  assert.match(auto,/tmp-grade-options/);
  assert.match(auto,/type="checkbox" value="3"/);
  assert.match(auto,/type="checkbox" value="2" checked/);
  assert.match(auto,/type="checkbox" value="1" checked/);
  assert.match(auto,/querySelectorAll\('\.tmp-grade-option input:checked'\)/);
  assert.match(auto,/namesByGrade/);
  assert.match(auto,/grades:group\.grades\.map\(Number\)/);
  assert.match(auto,/group\.grades\.forEach/);
  assert.match(board,/board-duty-auto-test\.js\?v=[a-zA-Z0-9-]+/);
});
