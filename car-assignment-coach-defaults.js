(()=>{
  'use strict';

  function isNewUnbuiltSelection(){
    const date=document.getElementById('eventDate')?.value||'';
    const activeGrade=document.querySelector('.grade-btn.active');
    const builtCars=document.querySelectorAll('#carList .car-edit').length;
    return !!date && !!activeGrade && builtCars===0;
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

  function queueDefaults(){
    requestAnimationFrame(()=>setTimeout(applyStandardCoachDefaults,0));
    setTimeout(applyStandardCoachDefaults,120);
    setTimeout(applyStandardCoachDefaults,350);
  }

  document.addEventListener('change',event=>{
    if(event.target?.id==='eventDate') queueDefaults();
  });

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.grade-btn')) queueDefaults();
  });
})();