/* Fast member selection for guardian/player attendance.
   Avoid rebuilding the whole table when only the selected person changes. */
(function(){
  'use strict';

  function updateSelectionClasses(){
    document.querySelectorAll('#board [data-select-member]').forEach(button=>{
      const active=String(button.dataset.selectMember)===String(selectedMember||'');
      button.classList.toggle('selected',active);
      button.setAttribute('aria-expanded',active?'true':'false');
    });
    document.querySelectorAll('#board .status-btn').forEach(button=>{
      button.disabled=String(button.dataset.member)!==String(selectedMember||'');
    });
  }

  window.selectMember=function(id){
    if(typeof pendingAnswers!=='undefined' && pendingAnswers.size){
      if(typeof showAnswerWaitNotice==='function')showAnswerWaitNotice();
      return;
    }

    const next=String(selectedMember||'')===String(id)?'':String(id);
    if(next!==String(selectedMember||'')){
      const text=document.getElementById('commentText');
      if(text)text.value='';
      if(typeof selectedEscortGrade!=='undefined')selectedEscortGrade='';
    }

    selectedMember=next;
    updateSelectionClasses();

    if(typeof renderEditor==='function')renderEditor();
    if(typeof window.refreshAttendanceEditorOverlay==='function'){
      requestAnimationFrame(()=>window.refreshAttendanceEditorOverlay());
    }
  };
})();