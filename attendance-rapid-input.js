/* Guardian/player attendance rapid-input controller.
   UI updates immediately. Each cell saves its latest state after taps settle.
   Different cells may save in parallel; the same cell always saves in order. */
(function(){
  'use strict';

  const states=new Map();

  function keyOf(memberId,eventId){
    return JSON.stringify([String(memberId),String(eventId)]);
  }

  function updateCell(button,status){
    button.textContent=status||'・';
    button.classList.remove('status-o','status-x');
    const cls=statusClass(status);
    if(cls)button.classList.add(cls);

    const head=document.querySelector('[data-summary-event="'+CSS.escape(button.dataset.event)+'"] .event-counts');
    if(head)head.innerHTML=countMarkup(countStatuses(button.dataset.event));
  }

  function setSavedLabel(){
    const sync=document.getElementById('syncText');
    if(sync)sync.textContent='保存済み '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
  }

  function setErrorLabel(){
    const sync=document.getElementById('syncText');
    if(sync)sync.textContent='保存できませんでした。もう一度押してください。';
  }

  function schedule(state){
    clearTimeout(state.timer);
    state.timer=setTimeout(()=>send(state),180);
  }

  async function send(state){
    if(state.sending)return;

    state.sending=true;
    const sentVersion=state.version;
    const sentStatus=state.status;

    try{
      await api('POST',{
        action:'answer',
        memberId:state.memberId,
        eventId:state.eventId,
        status:sentStatus
      });

      if(state.version===sentVersion){
        states.delete(state.key);
        setSavedLabel();
      }
    }catch(e){
      if(state.version===sentVersion)states.delete(state.key);
      setErrorLabel();
    }finally{
      state.sending=false;
      if(states.get(state.key)===state && state.version!==sentVersion){
        schedule(state);
      }
    }
  }

  document.addEventListener('click',function(event){
    const button=event.target.closest('#board .status-btn');
    if(!button||button.disabled)return;

    const memberId=String(button.dataset.member||'');
    const eventId=String(button.dataset.event||'');
    if(!memberId||!eventId||memberId!==String(selectedMember||''))return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const current=data.answers?.[memberId]?.[eventId]||'';
    const next=nextStatus(current);

    data.answers[memberId]??={};
    if(next)data.answers[memberId][eventId]=next;
    else delete data.answers[memberId][eventId];

    updateCell(button,next);

    const key=keyOf(memberId,eventId);
    let state=states.get(key);
    if(!state){
      state={key,memberId,eventId,status:next,version:0,sending:false,timer:0};
      states.set(key,state);
    }
    state.status=next;
    state.version+=1;
    schedule(state);
  },true);
})();