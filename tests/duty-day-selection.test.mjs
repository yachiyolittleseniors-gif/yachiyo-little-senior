import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(board, /board-duty-auto-test\.js\?v=20261103-temp-roster1/);
});
