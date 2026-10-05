/* Month-specific duty roster rules. Shared by the browser and Netlify Functions. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DutyGradePolicy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function grades(table){
    if(!table)return [];
    if(table.grades==null)return [2,1];
    const values=table.grades;
    return Array.isArray(values)&&[2,3].includes(values.length)&&
      values.every(g=>Number.isInteger(g)&&[1,2,3].includes(g))&&
      new Set(values).size===values.length?values.slice():[];
  }
  function monthKey(table){
    const y=Number(table?.year),m=Number(table?.month);
    return Number.isInteger(y)&&y>=2020&&y<=2100&&Number.isInteger(m)&&m>=1&&m<=12?
      y+'-'+String(m).padStart(2,'0'):'';
  }
  function dateParts(value){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);
    const d=new Date(Date.UTC(y,mo-1,day));
    return y>=2020&&y<=2100&&d.getUTCFullYear()===y&&d.getUTCMonth()===mo-1&&d.getUTCDate()===day?
      {year:y,month:mo,day,key:m[1]+'-'+m[2]}:null;
  }
  function resolve(image){return image?.table||null;}
  function gradesForDate(images,date,tableForImage=resolve,include=()=>true){
    const parts=dateParts(date);if(!parts)return [];
    const tables=(Array.isArray(images)?images:[]).filter(include).map(tableForImage)
      .filter(t=>t&&monthKey(t)===parts.key);
    if(!tables.length)return [];
    // Never infer a request month's grades from a different month's upload.
    const first=grades(tables[0]);
    if(!first.length||tables.some(t=>grades(t).slice().sort().join(',')!==first.slice().sort().join(',')))return [];
    return first;
  }
  function defaultGrades(images,year,month,tableForImage=resolve){
    const key=monthKey({year,month});if(!key)return [2,1];
    const tables=(Array.isArray(images)?images:[]).filter(i=>i&&i.testMode!==true)
      .map(tableForImage).filter(t=>monthKey(t)&&monthKey(t)<=key&&grades(t).length)
      .sort((a,b)=>monthKey(b).localeCompare(monthKey(a)));
    return tables.length?grades(tables[0]):[2,1];
  }
  function familyName(value){
    return String(value||'').normalize('NFKC').trim()
      .replace(/(?:\([父母]\)|[父母])$/,'').replace(/[\s　()]+/g,'').slice(0,60);
  }
  function collectFamilies(members){
    const map=new Map();
    (Array.isArray(members)?members:[]).forEach(member=>{
      const grade=String(member?.grades?.[0]||member?.grade||'');
      const name=familyName(member?.name);
      if(!['1','2','3'].includes(grade)||!name)return;
      const key=grade+'|'+name,kana=familyName(member?.kana)||name;
      if(!map.has(key))map.set(key,{grade,name,kana});
    });
    return [...map.values()].sort((a,b)=>Number(b.grade)-Number(a.grade)||a.kana.localeCompare(b.kana,'ja')||a.name.localeCompare(b.name,'ja'));
  }
  function replacementCandidates(images,date,families,tableForImage=resolve,include=()=>true){
    const active=new Set(gradesForDate(images,date,tableForImage,include).map(String));
    const map=new Map();
    (Array.isArray(families)?families:[]).forEach(person=>{
      const grade=String(person?.grade||''),name=String(person?.name||'').normalize('NFKC').replace(/[()\s　]/g,'').slice(0,60);
      if(active.has(grade)&&name)map.set(grade+'|'+name,{grade,name});
    });
    return [...map.values()].sort((a,b)=>Number(b.grade)-Number(a.grade)||a.name.localeCompare(b.name,'ja'));
  }
  function validTable(table){
    const gs=grades(table);
    if(!Number.isInteger(table?.year)||!Number.isInteger(table?.month)||!monthKey(table)||!gs.length||!Array.isArray(table.rows)||!table.rows.length||table.rows.length>31||!Array.isArray(table.activityDays))return false;
    const seen=new Set();
    for(const row of table.rows){
      if(!Array.isArray(row)||row.length!==2+gs.length*2||!Number.isInteger(row[0]))return false;
      const date=monthKey(table)+'-'+String(row[0]).padStart(2,'0');
      if(!dateParts(date)||seen.has(row[0])||row.slice(2).some(n=>typeof n!=='string'||!n.trim()||n.length>60))return false;
      seen.add(row[0]);
    }
    return table.activityDays.every(d=>seen.has(d));
  }
  function parseRows(text,year,month,active){
    if(!grades({grades:active}).length)throw new Error('対象学年を確認してください。');
    const rows=String(text||'').trim().split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{
      const values=line.normalize('NFKC').split(/[,\t]/).map(v=>v.trim());
      const day=Number(values.shift());
      if(values.length!==active.length*2||values.some(n=>!n||n.length>60))throw new Error((index+1)+'行目の日付と'+(active.length*2)+'名の名前を確認してください。');
      return [day,'日月火水木金土'[new Date(Date.UTC(year,month-1,day)).getUTCDay()],...values];
    });
    if(!validTable({year,month,grades:active,activityDays:[],rows}))throw new Error('日付・対象学年・担当者数・日付の重複を確認してください。');
    return rows.sort((a,b)=>a[0]-b[0]);
  }
  return Object.freeze({grades,monthKey,dateParts,gradesForDate,defaultGrades,familyName,collectFamilies,replacementCandidates,validTable,parseRows});
});
