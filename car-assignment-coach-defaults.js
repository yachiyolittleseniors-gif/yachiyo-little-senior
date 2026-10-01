(()=>{
  'use strict';

  function applyStandardCoachDefaults(){
    const status=document.getElementById('status');
    if(!status || status.textContent.trim()!=='変更内容は自動保存されます。') return;

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

  function scheduleApply(){
    setTimeout(applyStandardCoachDefaults,0);
  }

  document.addEventListener('change',event=>{
    if(event.target && (event.target.id==='eventDate' || event.target.classList?.contains('grade-btn'))){
      scheduleApply();
    }
  },true);

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.grade-btn')) scheduleApply();
  },true);
})();