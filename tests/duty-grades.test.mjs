import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import policy from '../netlify/duty-grade-policy.cjs';
import {integrateBoard,integrateAuto,integrateSiteData,integrateRequests,integrateHtml} from '../netlify/prepare-duty-grades.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(resolve(root,name),'utf8');
const table=(year,month,grades=[2,1])=>({year,month,grades,activityDays:[],rows:[[1,'木',...grades.flatMap(g=>['担当'+g+'甲','担当'+g+'乙'])]]});
const july={id:'july',table:table(2027,7,[3,2,1])};
const august={id:'august',table:table(2027,8,[2,1])};
const members=[
  {id:'a',name:'山田父',kana:'やまだ ちち',grades:['3']},
  {id:'b',name:'山田母',kana:'やまだ はは',grades:['3']},
  {id:'c',name:'石川（晃）父',grades:['1']},
  {id:'d',name:'石川晃母',grades:['1']},
  {id:'e',name:'石川（圭）父',grades:['1']},
  {id:'f',name:'齋藤父',grades:['2']}
];
const families=policy.collectFamilies(members);
const plain=value=>JSON.parse(JSON.stringify(value));
test('two and three groups preserve column order, invalid metadata is rejected',()=>{
  assert.deepEqual(policy.grades({}),[2,1]);
  assert.deepEqual(policy.grades({grades:[1,3,2]}),[1,3,2]);
  for(const grades of [[1,1],[1],[1,2,3,3],['2','1'],[0,1]])assert.deepEqual(policy.grades({grades}),[]);
});
test('a future two-grade upload never changes an earlier three-grade month',()=>{
  assert.deepEqual(policy.gradesForDate([august,july],'2027-07-01'),[3,2,1]);
  assert.deepEqual(policy.gradesForDate([august,july],'2027-08-01'),[2,1]);
  assert.deepEqual(policy.gradesForDate([august,july],'2027-06-01'),[]);
});
test('transition is driven by each roster, not April, June or an upload timestamp',()=>{
  for(const month of [1,4,5,6,7,8,11,12]){
    const image={table:table(2027,month,[3,2,1])};
    const date='2027-'+String(month).padStart(2,'0')+'-01';
    assert.deepEqual(policy.gradesForDate([image],date),[3,2,1]);
  }
});
test('family catalog merges parents but not distinct same-surname families',()=>{
  assert.equal(families.length,4);
  assert.deepEqual(families.filter(f=>f.grade==='1').map(f=>f.name).sort(),['石川圭','石川晃']);
  assert.equal(families.filter(f=>f.name==='山田').length,1);
});
test('candidate list includes unassigned parents and excludes inactive grades',()=>{
  assert.equal(policy.replacementCandidates([july,august],'2027-07-01',families).length,4);
  const augustList=policy.replacementCandidates([july,august],'2027-08-01',families);
  assert.equal(augustList.length,3);assert(!augustList.some(f=>f.grade==='3'));
  assert(augustList.some(f=>f.name==='齋藤'));
  assert.deepEqual(policy.replacementCandidates([july],'2027-08-01',families),[]);
});
test('name normalization is not applied twice to an already normalized catalog',()=>{
  const f=policy.collectFamilies([{name:'慈母父',grades:['1']},{name:'慈母母',grades:['1']}]);
  assert.equal(f.length,1);assert.equal(f[0].name,'慈母');
  assert.equal(policy.replacementCandidates([august],'2027-08-01',f)[0].name,'慈母');
});
test('test rosters do not influence public defaults or public month candidates',()=>{
  const testImage={table:table(2027,9,[3,2,1]),testMode:true};
  assert.deepEqual(policy.defaultGrades([july,august,testImage],2027,9),[2,1]);
  assert.deepEqual(policy.gradesForDate([testImage],'2027-09-01',i=>i.table,i=>!i.testMode),[]);
});
test('automatic draft inherits the latest earlier roster; no fixed seasonal switch',()=>{
  assert.deepEqual(policy.defaultGrades([july,august],2027,7),[3,2,1]);
  assert.deepEqual(policy.defaultGrades([july,august],2027,9),[2,1]);
  assert.deepEqual(policy.defaultGrades([july],2028,1),[3,2,1]);
  assert.deepEqual(policy.defaultGrades([august],2027,5),[2,1]);
});
test('legacy tables without explicit grades stay two-grade',()=>{
  const t=table(2026,10);delete t.grades;
  assert(policy.validTable(t));assert.deepEqual(policy.gradesForDate([{table:t}],'2026-10-01'),[2,1]);
});
test('saved table validator accepts exactly four or six names per day',()=>{
  assert(policy.validTable(july.table));assert(policy.validTable(august.table));
  const broken=structuredClone(july.table);broken.rows[0].pop();assert.equal(policy.validTable(broken),false);
  const wrong=structuredClone(august.table);wrong.rows[0].push('extra');assert.equal(policy.validTable(wrong),false);
});
test('invalid dates, duplicate days and invalid activity days are rejected',()=>{
  for(const mutate of [t=>t.rows[0][0]=32,t=>t.rows.push(t.rows[0]),t=>t.activityDays=[20],t=>t.grades=[2,2]]){
    const t=structuredClone(july.table);mutate(t);assert.equal(policy.validTable(t),false);
  }
  assert.equal(policy.dateParts('2027-02-29'),null);assert(policy.dateParts('2028-02-29'));
});
test('image review parses both formats and preserves selected grade order',()=>{
  assert.equal(policy.parseRows('1,甲,乙,丙,丁',2027,7,[2,1])[0].length,6);
  assert.equal(policy.parseRows('1,甲,乙,丙,丁,戊,己',2027,7,[3,2,1])[0].length,8);
  assert.throws(()=>policy.parseRows('1,甲,乙,丙,丁',2027,7,[3,2,1]));
  assert.throws(()=>policy.parseRows('32,甲,乙,丙,丁',2027,7,[2,1]));
});
test('shared browser and server rules are identical',()=>{
  const context={};vm.runInNewContext(read('netlify/duty-grade-policy.cjs'),context);
  assert.deepEqual(plain(context.DutyGradePolicy.gradesForDate([july,august],'2027-08-01')),[2,1]);
});
test('HTML integration leaves inline scripts intact and is idempotent',()=>{
  const original='<html><head><script>window.unchanged=true;</script></head><body><script src="./duty-image-reader.js?v=old"></script><script src="./board-duty-roster.js?v=old"></script><script src="./board-duty-auto-test.js?v=old"></script></body></html>';
  const result=integrateHtml(original);
  assert(result.includes('<script>window.unchanged=true;</script>'));
  assert(result.indexOf('duty-month-grade-policy')<result.indexOf('src="./board-duty-roster.js'));
  assert.equal(integrateHtml(result),result);
});
test('integration refuses unknown source rather than publishing partial replacements',()=>{
  for(const transform of [integrateBoard,integrateAuto,integrateSiteData,integrateRequests,integrateHtml])assert.throws(()=>transform('unrecognized source'));
});
// The deployment build has the complete repository. These tests execute its real
// transformed functions without network calls or writes to production storage.
const deployed=existsSync(resolve(root,'netlify/functions/duty-change-requests.mjs'));
function section(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'Missing source section: '+start);return source.slice(a,b);
}
test('deployed adapters are integrated and no two-grade-only validation survives',{skip:!deployed},()=>{
  for(const path of ['board-duty-roster.js','board-duty-auto-test.js','netlify/functions/site-data.mjs','netlify/functions/duty-change-requests.mjs'])assert(read(path).includes('duty-month-grades-integration:20261005-1'));
  assert(!read('board-duty-auto-test.js').includes("mo>=6?['2','1']:['3','2','1']"));
  assert(!read('netlify/functions/site-data.mjs').includes('t.grades.length!==2'));
  assert(!read('board-duty-roster.js').includes('row.slice(2,6)'));
});
test('actual server roster verification recognizes all three grade groups',{skip:!deployed},()=>{
  const source=read('netlify/functions/duty-change-requests.mjs');
  const fn=section(source,'function requestMatchesRoster(','function requestDateIsTestMode(');
  const context={rosterTableForImage:i=>i.table,rosterCanonicalName:v=>String(v||''),rosterNameKey:v=>String(v||'').replace(/[（）()\s]/g,'')};
  vm.runInNewContext(fn,context);
  for(const grade of [3,2,1])assert(context.requestMatchesRoster({images:[july],changes:[]},'2027-07-01',String(grade),'担当'+grade+'甲'));
  assert(!context.requestMatchesRoster({images:[august],changes:[]},'2027-08-01','3','担当3甲'));
});
test('actual two/three-grade save validation does not drop the third grade',{skip:!deployed},()=>{
  const source=read('netlify/functions/site-data.mjs');
  const body=section(source,'      const valid = images.every(item => {','      if (!valid) {');
  for(const t of [july.table,august.table]){
    const context={images:[{name:'test.png',data:'data:image/png;base64,AA==',table:structuredClone(t)}]};
    vm.runInNewContext(body+'\nthis.accepted=valid;',context);assert.equal(context.accepted,true);
  }
});
test('actual approval adds the third-grade replacement and keeps existing changes',{skip:!deployed},async()=>{
  const source=read('netlify/functions/duty-change-requests.mjs');
  const matcher=section(source,'function requestMatchesRoster(','function requestDateIsTestMode(');
  const apply=section(source,'async function applyRequestToRoster(','async function findRequestByApprovalToken(');
  let saved;
  const initial={initialized:true,images:[july],changes:[{id:'old',date:'2027-07-02',grade:'2',from:'A',to:'B'}]};
  const store={get:async()=>structuredClone(initial),setJSON:async(key,value)=>{saved=value;}};
  const context={DutyGradePolicy:policy,LEGACY_KEY:'roster',crypto:{randomUUID:()=> 'test-id'},rosterTableForImage:i=>i.table,rosterCanonicalName:v=>String(v||''),rosterNameKey:v=>String(v||''),cleanName:v=>String(v||''),validDate:v=>!!policy.dateParts(v),validGrade:v=>[1,2,3].includes(Number(v))};
  vm.runInNewContext(matcher+apply,context);
  assert((await context.applyRequestToRoster(store,{requestType:'replace',date:'2027-07-01',fromGrade:'1',fromName:'担当1甲',toGrade:'3',toName:'山田',requestNo:'T001'})).ok);
  assert.equal(saved.changes.length,2);assert.equal(saved.changes[1].toGrade,'3');assert.equal(saved.images[0].table.rows[0].length,8);
});
test('actual two-grade month rejects a stale third-grade replacement',{skip:!deployed},async()=>{
  const source=read('netlify/functions/duty-change-requests.mjs');
  const context={DutyGradePolicy:policy,LEGACY_KEY:'roster',requestMatchesRoster:()=>true,rosterTableForImage:i=>i.table};
  vm.runInNewContext(section(source,'async function applyRequestToRoster(','async function findRequestByApprovalToken('),context);
  let wrote=false;const store={get:async()=>({images:[august],changes:[]}),setJSON:async()=>{wrote=true;}};
  const result=await context.applyRequestToRoster(store,{requestType:'replace',date:'2027-08-01',fromGrade:'2',fromName:'A',toGrade:'3',toName:'B'});
  assert.equal(result.ok,false);assert.equal(wrote,false);
});
test('actual replacement browser adapter uses month policy and parent catalog',{skip:!deployed},()=>{
  const source=read('board-duty-roster.js');
  const context={images:[july,august],replacementFamilies:families,canViewRoster:()=>true,window:{DutyGradePolicy:policy,DutyRosterData:{tableForImage:i=>i.table}}};
  vm.runInNewContext(section(source,'  function rosterReplacementCandidates(','  function todayYmd('),context);
  assert.equal(context.rosterReplacementCandidates('2027-07-01').length,4);
  assert.equal(context.rosterReplacementCandidates('2027-08-01').length,3);
});
test('actual table renderer shows six names and three grade headers',{skip:!deployed},()=>{
  const source=read('board-duty-roster.js');
  const context={images:[july],changes:[],tableList:{innerHTML:''},isPublicRosterActive:()=>true,canViewRoster:()=>true,escapeHtml:v=>String(v||''),appliedCell:(table,row,grade,column,name)=>({value:name,changed:false,original:name,column})};
  vm.runInNewContext(section(source,'  function renderTables(){','  function cleanupExpiredImages('),context);
  context.renderTables();
  const html=context.tableList.innerHTML;
  assert(html.includes('has-three-grades'));assert(html.includes('<col span="6"'));
  for(const g of [3,2,1])for(const n of ['甲','乙'])assert(html.includes('担当'+g+n));
  assert.equal((html.match(/colspan="2"/g)||[]).length,3);
  context.images=[august];context.renderTables();
  assert(!context.tableList.innerHTML.includes('has-three-grades'));
  assert(context.tableList.innerHTML.includes('<col span="4" style="width:18%">'));
});

test('same household is excluded despite parenthesized roster names',{skip:!deployed},()=>{
  const source=read('board-duty-roster.js');
  const key=v=>String(v||'').normalize('NFKC').replace(/[()\s]/g,'');
  const context={window:{DutyRosterData:{nameKey:key}},cleanName:key,escapeHtml:v=>String(v||''),octoberDisplayName:v=>v};
  vm.runInNewContext(section(source,'  function personOptionValue(','  function dutySlotValue('),context);
  const options=context.requestPersonOptions('2027-07-01',[{grade:'1',name:'石川晃'},{grade:'1',name:'石川圭'}],'1|石川（晃）');
  assert(!options.includes('value="1|石川晃"'));assert(options.includes('value="1|石川圭"'));
});
test('submit and LINE-resume submit both reject aliases of the same household',{skip:!deployed},()=>{
  const source=read('netlify/functions/duty-change-requests.mjs');
  assert.equal(source.split('fromGrade===toGrade&&rosterNameKey(fromName)===rosterNameKey(toName)').length-1,2);
});
