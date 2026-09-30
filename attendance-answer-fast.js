/* Guardian attendance: keep rapid taps responsive and save cells in parallel. */
(function(){
  'use strict';

  let flushTimer=0;

  refreshAnswerCells=function(){
    document.querySelectorAll('#board .status-btn').forEach(button=>{
      const m=button.dataset.member,e=button.dataset.event,s=data.answers?.[m]?.[e]||'';
      button.textContent=s||'・';
      button.className='status-btn '+statusClass(s);
      button.disabled=m!==selectedMember;
      button.onclick=saveAnswer;
    });
    document.querySelectorAll('[data-summary-event]').forEach(button=>{
      const counts=button.querySelector('.event-counts');
      if(counts)counts.innerHTML=countMarkup(countStatuses(button.dataset.summaryEvent));
    });
  };

  showAnswerSaveState=function(){
    const busy=answerSaving||pendingAnswers.size>0;
    const notice=document.getElementById('answerWaitNotice');
    if(notice){
      notice.hidden=!busy;
      if(busy)notice.textContent=answerSaveFailed?'未保存があります。「再保存」を押してください。':'保存中です。少しお待ちください。';
    }
    const status=$('#syncText');
    status.textContent=busy?(answerSaveFailed?'未保存があります ':'保存中…'):'保存済み '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
    if(answerSaveFailed){
      const retry=document.createElement('button');
      retry.type='button';
      retry.textContent='再保存';
      retry.onclick=flushAnswers;
      status.appendChild(retry);
    }
  };

  function scheduleFlush(){
    clearTimeout(flushTimer);
    flushTimer=setTimeout(()=>void flushAnswers(),120);
  }

  flushAnswers=async function(){
    if(answerSaving||!pendingAnswers.size)return;
    clearTimeout(flushTimer);
    answerSaving=true;
    answerSaveFailed=false;
    showAnswerSaveState();

    const batch=[...pendingAnswers.entries()];
    const results=await Promise.all(batch.map(async([key,item])=>{
      try{
        await api('POST',{action:'answer',memberId:item.memberId,eventId:item.eventId,status:item.status});
        if(pendingAnswers.get(key)===item)pendingAnswers.delete(key);
        return true;
      }catch{
        return false;
      }
    }));

    answerSaveFailed=results.some(ok=>!ok);
    answerSaving=false;
    refreshAnswerCells();
    showAnswerSaveState();

    if(pendingAnswers.size&&!answerSaveFailed)scheduleFlush();
  };

  saveAnswer=function(ev){
    const b=ev.currentTarget,m=b.dataset.member,e=b.dataset.event;
    if(m!==selectedMember)return;

    const s=nextStatus(data.answers?.[m]?.[e]||'');
    data.answers[m]??={};
    if(s)data.answers[m][e]=s;
    else delete data.answers[m][e];

    pendingAnswers.set(JSON.stringify([m,e]),{memberId:m,eventId:e,status:s});
    refreshAnswerCells();
    showAnswerSaveState();
    scheduleFlush();
  };

  // Rebind any cells already rendered before this helper loaded.
  if(document.querySelector('#board .status-btn'))refreshAnswerCells();
})();