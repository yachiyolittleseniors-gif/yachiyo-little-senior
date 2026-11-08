import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../attendance-future-only.js',import.meta.url),'utf8');
function events(today,stored=[],schedule=[]){
 const clock=new Date(today+'T12:00:00');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock.getTime()]));}}
 const context={Date:Clock,data:{events:stored},scheduleEvents:schedule};
 vm.createContext(context);vm.runInContext(source,context);return context.visibleEvents();
}
test('missing November Sundays and weekday holiday appear without any schedule',()=>{
 const result=events('2026-11-07').map(e=>e.date);
 for(const d of ['2026-11-08','2026-11-15','2026-11-22','2026-11-23','2026-11-29'])assert.ok(result.includes(d),d);
 assert.ok(!result.includes('2026-11-09'));assert.ok(!result.includes('2026-11-01'));
});
test('existing IDs survive and schedule weekdays merge without duplicates',()=>{
 const result=events('2026-11-07',[{id:'original',date:'2026-11-14'}],[{date:'2026-11-14',title:'練習'},{date:'2026-11-16',title:'練習'}]);
 assert.equal(result.find(e=>e.date==='2026-11-14').id,'original');
 assert.equal(result.find(e=>e.date==='2026-11-15').id,'schedule_20261115');
 assert.ok(result.some(e=>e.date==='2026-11-16'));assert.equal(new Set(result.map(e=>e.date)).size,result.length);
});
test('substitute, citizen holidays and year boundary',()=>{
 for(const [start,date] of [['2026-05-01','2026-05-06'],['2026-09-01','2026-09-22'],['2027-03-01','2027-03-22'],['2026-12-15','2027-01-01']])assert.ok(events(start).some(e=>e.date===date),date);
});
test('all three attendance pages use the updated shared calendar',()=>{
 for(const page of ['attendance','player-attendance','coach-attendance'])assert.match(readFileSync(new URL('../'+page+'.html',import.meta.url),'utf8'),/attendance-future-only.js\?v=20261108-two-months1/);
});

test('two-month window includes endpoint and excludes later dates',()=>{
 const result=events('2026-11-08',[],[{date:'2027-01-08'},{date:'2027-01-09'}]).map(e=>e.date);
 assert.ok(result.includes('2026-12-27'));
 assert.ok(result.includes('2027-01-08'));
 assert.ok(!result.includes('2027-01-09'));
});
test('two months from month end clamps to last day of target month',()=>{
 const result=events('2026-12-31',[],[{date:'2027-02-28'},{date:'2027-03-01'}]).map(e=>e.date);
 assert.ok(result.includes('2027-02-28'));
 assert.ok(!result.includes('2027-03-01'));
});
