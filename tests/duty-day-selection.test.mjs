import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../board-duty-auto-test.js', import.meta.url), 'utf8');
const board = readFileSync(new URL('../board.html', import.meta.url), 'utf8');

test('automatic duty roster has exact target-day selection and weekday add controls', () => {
  for (const token of ['dutyDaySelectionCount','dutyDaySelectionList','dutyAddWeekdayToggle','dutyAddWeekdayDate','dutyAddWeekdayButton']) {
    assert.ok(source.includes(token), token + ' is present');
  }
  assert.match(source, /selectedDays=new Set\(\)/);
  assert.match(source, /selectedDays=new Set\(defaultDutyDays\(y,mo\)\)/);
});

test('generated rows use only selected days', () => {
  assert.match(source, /days=Array\.from\(selectedDays\)\.sort/);
  assert.match(source, /対象日を1日以上選択してください/);
  assert.doesNotMatch(source, /evs\.length\)days\.push/);
  assert.match(source, /対象日：'\+days\.length\+'日（選択した日のみ）/);
});

test('weekday add is limited to the target month and excludes weekends and holidays', () => {
  assert.match(source, /parts\[0\]!==y\|\|parts\[1\]!==mo/);
  assert.match(source, /dt\.getDay\(\)===0\|\|dt\.getDay\(\)===6\|\|holidays\(y\)\.has\(value\)/);
  assert.match(source, /土日祝は上の一覧から選択してください/);
});

test('temporary duty builder and folded manual image fallback coexist', () => {
  assert.match(source, /temporaryDutyCreateBtn|initTemporaryDuty/);
  assert.match(board, /id="temporaryDutyCreateBtn"/);
  assert.match(board, />画像を手動登録</);
  assert.match(board, /id="dutyRosterImageInput"/);
  assert.match(board, /id="saveDutyRosterBtn"/);
});

test('board loads the date-selection and temporary-roster asset', () => {
  assert.match(board, /board-duty-auto-test\.js\?v=[a-zA-Z0-9-]+/);
});

test('December continues November assignments rather than restarting the fixed rotation', () => {
  const context = vm.createContext({window:{}});
  vm.runInContext(readFileSync(new URL('../duty-roster-data.js', import.meta.url), 'utf8'), context);
  const start=source.indexOf('  function nextDutyPosition('),end=source.indexOf('  function holidays(',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(source.slice(start,end),context);
  const lists={
    2:['永井','藤澤','本村','森田','矢羽田','荒木','石川','石山','大谷部','加藤','古賀','齋藤','篠崎','椙浦','高橋','竹内','筒井'],
    1:['赤羽','秋葉','石川晃','井上遙','井上竜','宇山','江見','加賀原','粕谷','亀井','川村','小池','高祖','小堀','紺野','内藤','中濱','長峰','松井','松浦','溝上','村山','本吉','山澤奏','山本要','山本諒']
  };
  const images=[
    {table:{year:2026,month:11,rows:[[29,'日','森田','矢羽田','江見','加賀原'],[28,'土','藤澤','本村','井上竜','宇山']]}},
    {table:{year:2026,month:12,rows:[[29,'火','藤澤','本村','井上竜','宇山']]}},
    {table:{year:2026,month:11,temporary:true,rows:[[30,'月','永井','藤澤','高祖','小堀']]}}
  ];
  for(const [grade,expected] of [[2,['荒木','石川']],[1,['粕谷','亀井']]]){
    const list=lists[grade].map(name=>({name}));
    const pos=context.nextDutyPosition(images,2026,12,grade,list);
    assert.deepEqual([list[pos].name,list[(pos+1)%list.length].name],expected);
  }
  const excluded=lists[2].filter(name=>name!=='矢羽田').map(name=>({name}));
  assert.equal(excluded[context.nextDutyPosition(images,2026,12,2,excluded)].name,'荒木');
  assert.throws(()=>context.nextDutyPosition([],2026,12,2,excluded),/前月以前/);
  const yearEnd=[{table:{year:2026,month:12,rows:[[31,'木','竹内','筒井','山本要','山本諒']]}}];
  assert.equal(context.nextDutyPosition(yearEnd,2027,1,2,lists[2].map(name=>({name}))),0);
  assert.doesNotMatch(source,/var startAfter=/);
});
