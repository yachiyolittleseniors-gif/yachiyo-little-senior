(()=>{
  'use strict';

  function applyStandardCoachDefaults(){
    const coachCar=document.getElementById('coachCar');
    const manager=document.getElementById('coachManager');
    const managerDriver=document.getElementById('coachManagerDriver');
    const coachCount=document.getElementById('coachCount');
    if(!coachCar || !manager || !managerDriver || !coachCount) return;

    // 保存済みの配車（0や1など値が入っている）は変更しない。
    // 新規選択時は既存処理が coachCar を空文字に戻すため、その時だけ標準値を入れる。
    if(String(coachCar.value||'').trim()!=='') return;

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

  function queueDefaults(){
    setTimeout(applyStandardCoachDefaults,30);
    setTimeout(applyStandardCoachDefaults,180);
  }

  document.addEventListener('change',event=>{
    if(event.target?.id==='eventDate') queueDefaults();
  },true);

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.grade-btn')) queueDefaults();
  },true);
})();