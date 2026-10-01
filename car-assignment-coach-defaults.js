(()=>{
  'use strict';

  const ACCESS_KEY='yachiyoAttendancePass';
  const ASSIGNMENT_API='/.netlify/functions/car-assignment-data';

  function activeGrades(){
    return [...document.querySelectorAll('.grade-btn.active')]
      .map(button=>String(button.dataset.grade||''))
      .filter(grade=>['1','2','3'].includes(grade));
  }

  function currentDateValue(){
    return document.getElementById('eventDate')?.value||'';
  }

  function isNewUnbuiltSelection(){
    const builtCars=document.querySelectorAll('#carList .car-edit').length;
    return !!currentDateValue() && activeGrades().length>0 && builtCars===0;
  }

  function applyStandardCoachDefaults(){
    if(!isNewUnbuiltSelection()) return;

    const coachCar=document.getElementById('coachCar');
    const manager=document.getElementById('coachManager');
    const managerDriver=document.getElementById('coachManagerDriver');
    const coachCount=document.getElementById('coachCount');
    if(!coachCar || !manager || !managerDriver || !coachCount) return;

    coachCar.value='1';
    manager.checked=true;
    managerDriver.checked=false;
    coachCount.value='1';

    if(typeof window.syncVehicleChoice==='function') window.syncVehicleChoice('coachCar');
    if(typeof window.updateConditionalFields==='function') window.updateConditionalFields();
    if(typeof window.updateCounts==='function') window.updateCounts();
    if(typeof window.renderPreview==='function') window.renderPreview();
    if(typeof window.saveDraft==='function') window.saveDraft();
  }

  function ensureEscortBreakdownElement(){
    const row=document.getElementById('lowerGradeEscortCountRow');
    if(!row) return null;
    let el=document.getElementById('escortBreakdown');
    if(!el){
      el=document.createElement('small');
      el.id='escortBreakdown';
      el.className='parent-breakdown';
      row.appendChild(el);
    }
    return el;
  }

  function memberGrade(member){
    return String((Array.isArray(member?.grades)?member.grades[0]:member?.grade)||'');
  }

  function commentMatchesDate(comment,date){
    if(String(comment?.eventDate||'')===date) return true;
    if(!date) return false;
    const match=String(comment?.text||'').match(/(\d{1,2})\s*(?:\/|月)\s*(\d{1,2}(?:\s*(?:[.・,、]|\s+)\s*\d{1,2})*)/);
    if(!match) return false;
    const target=new Date(date+'T00:00:00');
    const days=(match[2].match(/\d{1,2}/g)||[]).map(Number);
    return Number(match[1])===target.getMonth()+1 && days.includes(target.getDate());
  }

  function familyName(name){
    return String(name||'').normalize('NFKC').replace(/[\s　]+/g,'').replace(/[父母]$/,'');
  }

  async function updateEscortBreakdown(){
    const el=ensureEscortBreakdownElement();
    if(!el) return;

    const date=currentDateValue();
    const selected=activeGrades();
    const selectedSet=new Set(selected);
    const targetGrade=Math.max(0,...selected.map(Number));

    if(!date || targetGrade<=1){
      el.textContent='';
      return;
    }

    let pass='';
    try{ pass=sessionStorage.getItem(ACCESS_KEY)||''; }catch{}
    if(!pass){ el.textContent=''; return; }

    try{
      const response=await fetch(ASSIGNMENT_API,{
        cache:'no-store',
        headers:{'content-type':'application/json','x-access-password':pass}
      });
      if(!response.ok) throw new Error('fetch failed');
      const body=await response.json();
      const data=body?.parentData||{};
      const members=Array.isArray(data.members)?data.members:[];
      const comments=Array.isArray(data.comments)?data.comments:[];
      const familiesByGrade={'3':new Set(),'2':new Set(),'1':new Set()};

      for(const member of members){
        const grade=memberGrade(member);
        const numeric=Number(grade);
        if(!(numeric>=1 && numeric<targetGrade) || selectedSet.has(grade)) continue;

        const hasEscort=comments.some(comment=>
          String(comment?.memberId)===String(member?.id) &&
          comment?.upperGrade===true &&
          commentMatchesDate(comment,date) &&
          (!comment?.escortGrade || selectedSet.has(String(comment.escortGrade)))
        );

        if(hasEscort && familiesByGrade[grade]){
          familiesByGrade[grade].add(familyName(member.name));
        }
      }

      const parts=['3','2','1']
        .filter(grade=>familiesByGrade[grade].size>0)
        .map(grade=>grade+'年'+familiesByGrade[grade].size+'名');

      el.textContent=parts.join('・');
    }catch{
      el.textContent='';
    }
  }

  function queueDefaults(){
    requestAnimationFrame(()=>setTimeout(applyStandardCoachDefaults,0));
    setTimeout(applyStandardCoachDefaults,120);
    setTimeout(applyStandardCoachDefaults,350);
  }

  function queueEscortBreakdown(){
    setTimeout(updateEscortBreakdown,80);
    setTimeout(updateEscortBreakdown,300);
  }

  document.addEventListener('change',event=>{
    if(event.target?.id==='eventDate'){
      queueDefaults();
      queueEscortBreakdown();
    }
    if(event.target?.id==='syncAttendance'){
      queueEscortBreakdown();
    }
  });

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.grade-btn')){
      queueDefaults();
      queueEscortBreakdown();
    }
    if(event.target?.closest?.('#syncAttendance')){
      setTimeout(updateEscortBreakdown,700);
    }
  });

  window.addEventListener('load',()=>{
    ensureEscortBreakdownElement();
    queueEscortBreakdown();
  });
})();