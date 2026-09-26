(function(){
  let saveNoticeTimer;
  window.showSaveNotice=function(message){
    const notice=document.getElementById('saveNotice');
    if(!notice) return;
    notice.textContent=message;
    notice.classList.add('show');
    clearTimeout(saveNoticeTimer);
    saveNoticeTimer=setTimeout(function(){notice.classList.remove('show');},1800);
  };
})();
