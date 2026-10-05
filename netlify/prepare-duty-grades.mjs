/* Build-time integration of the shared month-specific duty rules.
 * Only the listed legacy adapters are changed; storage, authentication and LINE
 * handlers remain in place. Every anchor is checked before any output is written.
 * Run before sync-home-csp.mjs. Idempotent for local development/build retries.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stamp='/* duty-month-grades-integration:20261005-1 */';
function replace(source,from,to,count=1){
  const actual=source.split(from).length-1;
  if(actual!==count)throw new Error('Duty grade integration: expected '+count+' occurrences, found '+actual+': '+from.slice(0,110));
  return source.split(from).join(to);
}
function range(source,start,end,replacement){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0||b<0||source.indexOf(start,a+start.length)>=0)throw new Error('Duty grade integration: ambiguous region '+start);
  return source.slice(0,a)+replacement+source.slice(b);
}
export function integrateBoard(source){
  if(source.includes(stamp))return source;
  source=replace(source,'  let images=[];',`  let images=[];
  let replacementFamilies=null;
  let replacementFamiliesFailed=false;
  window.getDutyRosterGradesForMonth=function(year,month){
    return window.DutyGradePolicy.defaultGrades(images,year,month,window.DutyRosterData.tableForImage);
  };`);
  const slices=source.split('row.slice(2,6)').length-1;
  if(slices!==4)throw new Error('Unexpected number of board roster slices: '+slices);
  source=replace(source,'row.slice(2,6)','row.slice(2,2+grades.length*2)',4);
  source=replace(source,"        const cells=[appliedCell(table,row,grades[0],0,row[2]),appliedCell(table,row,grades[0],1,row[3]),appliedCell(table,row,grades[1],0,row[4]),appliedCell(table,row,grades[1],1,row[5])];",`        const cells=grades.flatMap(function(grade,group){return [0,1].map(function(column){return appliedCell(table,row,grade,column,row[2+group*2+column]);});});`);
  source=replace(source,'<col span="4" style="width:18%">',`<col span="'+(grades.length*2)+'" style="width:'+(72/(grades.length*2))+'%">`);
  source=replace(source,`<th colspan="2">'+grades[0]+'年生</th><th colspan="2">'+grades[1]+'年生</th>`,`'+grades.map(function(grade){return'<th colspan="2">'+grade+'年生</th>';}).join('')+'`);
  source=replace(source,`<section class="duty-digital-roster" aria-label="`,`<section class="duty-digital-roster'+(grades.length===3?' has-three-grades':'')+'" aria-label="`);
  source=range(source,'  function rosterReplacementCandidates(date){','  function todayYmd(){',`  function rosterReplacementCandidates(date){
    return window.DutyGradePolicy.replacementCandidates(images,date,replacementFamilies,window.DutyRosterData.tableForImage,canViewRoster);
  }
`);
  source=replace(source,'      partnerApprovalEnabled=body.partnerApprovalEnabled===true;',`      replacementFamilies=Array.isArray(body.replacementFamilies)?body.replacementFamilies:null;
      replacementFamiliesFailed=replacementFamilies===null;
      partnerApprovalEnabled=body.partnerApprovalEnabled===true;`);
  source=replace(source,'    toSel.innerHTML=toOptions;',`    toSel.innerHTML=toOptions;
    toSel.disabled=!dateSel.value||replacementFamilies===null;
    if(!dateSel.value)toSel.innerHTML='<option value="">先に変更日を選択してください</option>';
    else if(replacementFamilies===null)toSel.innerHTML='<option value="">'+(replacementFamiliesFailed?'名簿を取得できません。ページを再読み込みしてください':'保護者名簿を確認中…')+'</option>';`);
  return stamp+'\n'+source;
}
export function integrateAuto(source){
  if(source.includes(stamp))return source;
  source=replace(source,'  paint();',`  paint();
  var gradeField=document.createElement('label');gradeField.className='duty-target-grade-field';
  gradeField.textContent='対象学年';
  var gradeSelect=document.createElement('select');gradeSelect.id='dutyAutoTargetGrades';
  gradeSelect.add(new Option('登録済み当番表に合わせる','auto'));
  gradeSelect.add(new Option('1・2年（2学年分）','2,1'));
  gradeSelect.add(new Option('1・2・3年（3学年分）','3,2,1'));
  gradeField.appendChild(gradeSelect);create.parentNode.insertBefore(gradeField,create);
  var gradeNote=document.createElement('p');gradeNote.className='duty-target-grade-note';
  gradeNote.textContent='切替月は固定しません。この案で確定した月から、変更後の候補もこの対象学年になります。';
  create.parentNode.insertBefore(gradeNote,create);
  gradeSelect.addEventListener('change',function(){preview.replaceChildren();preview.hidden=true;});`);
  source=replace(source,"active=mo>=6?['2','1']:['3','2','1']", "active=(gradeSelect.value==='auto'?window.getDutyRosterGradesForMonth(y,mo):gradeSelect.value.split(',')).map(String)");
  source=replace(source,'dataW=(totalW-monthW-dateW-dowW)/4','dataW=(totalW-monthW-dateW-dowW)/(active.length*2)');
  source=replace(source,'ci<4','ci<active.length*2');
  source=replace(source,'[x[1],x[2],x[3],x[5]].forEach','[x[1],x[2],x[3],...active.slice(1).map(function(_,i){return x[5+i*2];})].forEach');
  source=replace(source,"      var g1=active[0]||'2',g2=active[1]||'1';\n      ctx.fillText(g1+'年',(x[3]+x[5])/2,top+headerH/2);ctx.fillText(g2+'年',(x[5]+x[7])/2,top+headerH/2);", "      active.forEach(function(g,i){ctx.fillText(g+'年',(x[3+i*2]+x[5+i*2])/2,top+headerH/2);});");
  source=replace(source,'cidx<7','cidx<3+active.length*2');
  source=replace(source,'ctx.fillText(String(t),cx,yy+rowH/2);',"if(active.length===3)ctx.fillText(String(t),cx,yy+rowH/2,dataW-12);else ctx.fillText(String(t),cx,yy+rowH/2);");
  return stamp+'\n'+source;
}
export function integrateSiteData(source){
  if(source.includes(stamp))return source;
  source=replace(source,'t.grades.length!==2||new Set(t.grades).size!==2','![2,3].includes(t.grades.length)||new Set(t.grades).size!==t.grades.length');
  source=replace(source,'if(!Array.isArray(row)||row.length!==6)return false;', 'if(!Array.isArray(row)||row.length!==2+(t.grades||[2,1]).length*2)return false;');
  source=replace(source,'row.slice(2,6).some((name, index)', 'row.slice(2,2+grades.length*2).some((name, index)');
  return stamp+'\n'+source;
}
export function integrateRequests(source){
  if(source.includes(stamp))return source;
  source='import DutyGradePolicy from "../duty-grade-policy.cjs";\n'+source;
  source=replace(source,'row.slice(2,6).some((name,index)', 'row.slice(2,2+grades.length*2).some((name,index)');
  const guard=`      if(requestType==="replace"&&!DutyGradePolicy.gradesForDate(roster?.images,date,rosterTableForImage).includes(Number(toGrade))){
        return json({error:"変更後の学年が対象月の当番表と一致しません。対象月を確認して選び直してください。"},400);
      }
`;
  source=replace(source,'      if(requestType==="swap"&&!requestMatchesRoster(roster,swapDate,swapGrade,swapName)){',guard+'      if(requestType==="swap"&&!requestMatchesRoster(roster,swapDate,swapGrade,swapName)){',2);
  source=replace(source,'  const isSwap=item.requestType==="swap";',`  const isSwap=item.requestType==="swap";
  if(!isSwap&&!DutyGradePolicy.gradesForDate(roster?.images,item.date,rosterTableForImage).includes(Number(item.toGrade))){
    return{ok:false,error:"対象月の当番表の対象学年が変わっています。変更後の学年を確認してください。"};
  }`);
  // Enrich the authenticated GET only. No member IDs, contact information or
  // attendance answers are sent in this family-name catalog.
  const getEnd=source.indexOf('    if(request.method!=="POST")');
  if(getEnd<0)throw new Error('Request method boundary not found');
  const head=replace(source.slice(0,getEnd),'      return json({ok:true,...publicData(data,requesterHash,requesterDeviceHash)});',`      let replacementFamilies=null;
      try{
        const attendance=await store.get("content/attendance.json",{type:"json",consistency:"strong"});
        if(Array.isArray(attendance?.members))replacementFamilies=DutyGradePolicy.collectFamilies(attendance.members).map(({grade,name})=>({grade,name}));
      }catch{}
      return json({ok:true,...publicData(data,requesterHash,requesterDeviceHash),replacementFamilies});`);
  source=head+source.slice(getEnd);
  return stamp+'\n'+source;
}
export function integrateHtml(source){
  if(source.includes('id="duty-month-grade-policy"'))return source;
  const script=/<script\b[^>]*\bsrc=["'](?:\.\/)?board-duty-roster\.js(?:\?[^"']*)?["'][^>]*><\/script>/g;
  const found=[...source.matchAll(script)];
  if(found.length!==1)throw new Error('Expected one board duty script');
  source=source.replace(script,'<script id="duty-month-grade-policy" src="./duty-grade-policy.js?v=20261005-month1"></script>\n'+found[0][0]);
  source=replace(source,'</head>','<link rel="stylesheet" href="./duty-month-grades.css?v=20261005-month1">\n</head>');
  for(const filename of ['board-duty-roster.js','board-duty-auto-test.js','duty-image-reader.js']){
    const pattern=new RegExp('('+filename.replaceAll('.','\\.')+')(?:\\?[^"\\\']*)?(?=["\\\'])','g');
    let n=0;source=source.replace(pattern,(_,name)=>{n++;return name+'?v=20261005-month1';});
    if(n!==1)throw new Error('Expected one asset reference: '+filename+', got '+n);
  }
  return source;
}
export async function prepare(base=root){
  const adapters={
    'board-duty-roster.js':integrateBoard,
    'board-duty-auto-test.js':integrateAuto,
    'netlify/functions/site-data.mjs':integrateSiteData,
    'netlify/functions/duty-change-requests.mjs':integrateRequests,
    'board.html':integrateHtml
  };
  const generated=[];
  for(const [name,transform] of Object.entries(adapters)){
    const original=await readFile(resolve(base,name),'utf8');
    generated.push([name,transform(original)]);
  }
  generated.push(['duty-grade-policy.js',await readFile(resolve(base,'netlify/duty-grade-policy.cjs'),'utf8')]);
  // All source anchors have passed. A failed syntax/test check aborts the Netlify
  // build, so an incomplete deployment never replaces the last published site.
  for(const [name,text] of generated)await writeFile(resolve(base,name),text);
  for(const [name] of generated){
    if(/\.(?:mjs|js)$/.test(name))execFileSync(process.execPath,['--check',resolve(base,name)],{stdio:'inherit'});
  }
  console.log('Duty month-grade integration: 2/3-grade adapters prepared.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepare();
