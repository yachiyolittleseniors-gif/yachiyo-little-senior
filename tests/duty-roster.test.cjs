const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const root = join(__dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const carScript = read('car-assignment.html').split('<script>\nconst ASSIGNMENT_API=')[1].split('</script>')[0];
const executable = ('const ASSIGNMENT_API=' + carScript).split("\n$('#editTab').onclick")[0];
const plain = value => JSON.parse(JSON.stringify(value));

function setup() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',checked:false,innerHTML:'',textContent:'',style:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){}});
    return elements.get(selector);
  };
  const context = vm.createContext({window:{},document:{querySelector:element,querySelectorAll:()=>[]},console,URLSearchParams,setTimeout,clearTimeout});
  vm.runInContext(read('duty-roster-data.js'), context);
  vm.runInContext(executable, context);
  const run = source => vm.runInContext(source, context);
  element('#eventDate').value='2026-09-20';
  run(`selectedGrade='2';dutyRosterData={initialized:true,images:[{id:'duty-mtwelqz2-e6tiec',data:'image'}],changes:[{date:'2026-09-20',grade:'2',from:'本村',to:'荒木'}]};cars=[{id:'a',type:'player',capacity:8,driver:'荒木父',navigator:'荒木母',parents:['森田母','加藤母'],coaches:[],players:0,dutyMembers:[],dutyAutoMembers:[]}];`);
  return {context,run,element,model:context.window.DutyRosterData};
}

test('original duties and final replacements are resolved by date and grade',()=>{
  const {run}=setup();
  assert.deepEqual(plain(run('currentDutyTargets()')),['荒木','森田']);
  run("dutyRosterData.changes.push({date:'2026-09-20',grade:'2',from:'荒木',to:'加藤'})");
  assert.deepEqual(plain(run('currentDutyTargets()')),['加藤','森田']);
});

test('legacy images, new image tables, grades and deleted months',()=>{
  const {model}=setup();
  const data={initialized:true,images:[{id:'duty-mtwelqz2-e6tiec',data:'image'}],changes:[{date:'2026-09-06',grade:'1',from:'山本諒',to:'秋葉'}]};
  assert.deepEqual(plain(model.namesForDate(data,'2026-09-06','1')),['山本(要)','秋葉']);
  assert.deepEqual(plain(model.namesForDate(data,'2026-09-12','2')),['椙浦','高橋']);
  assert.deepEqual(plain(model.namesForDate(data,'2026-09-06','3')),[]);
  assert.deepEqual(plain(model.namesForDate(data,'2026-10-06','1')),[]);
  data.images=[{data:'image',table:{year:2026,month:11,grades:[3,2],rows:[[1,'日','甲','乙','丙','丁']],activityDays:[]}}];
  assert.deepEqual(plain(model.namesForDate(data,'2026-11-01','2')),['丙','丁']);
  data.images=[];
  assert.deepEqual(plain(model.namesForDate(data,'2026-09-06','1')),[]);
});

test('same changes are used for the board cells and car duty names',()=>{
  const {model}=setup();
  const table={year:2026,month:11,grades:[2,1],rows:[[1,'日','桓浦','乙','山本（諒）','丁']]};
  const changes=[{date:'2026-11-01',grade:'1',from:'山本諒',to:'秋葉'},{date:'2026-11-01',grade:'1',from:'秋葉',to:'山本（要）'}];
  assert.equal(model.applyChanges(table,1,1,'山本（諒）',changes).value,'山本（要）');
  assert.deepEqual(plain(model.namesForDate({initialized:true,images:[{data:'image',table}],changes},'2026-11-01','1')),['山本(要)','丁']);
});

test('mother priority, father fallback, and multiple duties in a car',()=>{
  const {run}=setup();
  run('applyDutyRoster()');
  assert.deepEqual(plain(run('cars[0].dutyAutoMembers')),['荒木母','森田母']);
  run("cars[0].navigator='';applyDutyRoster()");
  assert.deepEqual(plain(run('cars[0].dutyAutoMembers')),['荒木父','森田母']);
});

test('manual deselection and selection survive repeated sync and regenerated cars',()=>{
  const {run}=setup();
  run("applyDutyRoster();setDutyOverride('荒木母',false);setDutyOverride('加藤母',true);applyDutyRoster();applyDutyRoster();");
  assert.deepEqual(plain(run('cars[0].dutyMembers')),['森田母','加藤母']);
  run("cars=[{id:'new',driver:'森田父',navigator:'',parents:['荒木母','加藤母','森田母'],coaches:[],dutyMembers:[],dutyAutoMembers:[]}];applyDutyRoster()");
  assert.deepEqual(plain(run('cars[0].dutyMembers')),['森田母','加藤母']);
  assert.deepEqual(plain(run('cars[0].dutyAutoMembers')),['森田母']);
});

test('explicit father selection replaces the automatic mother duty',()=>{
  const {run}=setup();
  run("setDutyOverride('荒木父',true);applyDutyRoster()");
  assert.deepEqual(plain(run('cars[0].dutyMembers')),['森田母','荒木父']);
});

test('server persistence retains false overrides and reload applies them',()=>{
  const {run,context}=setup();
  const server=read('netlify/functions/car-assignment-data.mjs').replace(/^import .*;\n/,'').split('export default async')[0];
  const serverContext=vm.createContext({Date});
  vm.runInContext(server,serverContext);
  run("setDutyOverride('荒木母',false);setDutyOverride('加藤母',true)");
  serverContext.input=plain(run("({date:currentDate(),grade:selectedGrade,cars,dutyOverrides})"));
  context.saved=plain(vm.runInContext('normalizeAssignment(input)',serverContext));
  assert.deepEqual(context.saved.dutyOverrides,[{name:'荒木母',checked:false},{name:'加藤母',checked:true}]);
  run('dutyOverrides=[];cars=[];restoreDutyOverrides(saved);cars=saved.cars;applyDutyRoster()');
  assert.deepEqual(plain(run('cars[0].dutyMembers')),['森田母','加藤母']);
  assert.deepEqual(plain(run('previewGroup("player",cars,new Set(["荒木母","森田母","加藤母"]))')).includes('森田母<b class="duty-mark">当番</b>'),true);
});

test('legacy manual selections survive while automatic selections follow roster updates',()=>{
  const {run}=setup();
  run("cars[0].dutyMembers=['荒木母','加藤母'];cars[0].dutyAutoMembers=['荒木母'];restoreDutyOverrides({cars});applyDutyRoster()");
  assert.deepEqual(plain(run('dutyOverrides')),[{name:'加藤母',checked:true}]);
  run("dutyRosterData.changes.push({date:'2026-09-20',grade:'2',from:'荒木',to:'乙'})");
  const result=plain(run('applyDutyRoster()'));
  assert.deepEqual(result.missing,['乙']);
  assert.deepEqual(plain(run('cars[0].dutyMembers')),['森田母','加藤母']);
});

test('reset and selection restore do not leak manual settings to other dates or grades',()=>{
  const {run}=setup();
  run("setDutyOverride('荒木母',false);resetEntryFields()");
  assert.deepEqual(plain(run('dutyOverrides')),[]);
  run("setDutyOverride('荒木母',false);restoreDutyOverrides({cars:[]});selectedGrade='1'");
  assert.deepEqual(plain(run('dutyOverrides')),[]);
  assert.deepEqual(plain(run('currentDutyTargets()')),['江見','加賀原']);
});
