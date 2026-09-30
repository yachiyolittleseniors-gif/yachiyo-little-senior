/* Allow coach member selection/deselection while answer saves continue in background. */
(function(){
  'use strict';

  window.selectMember=function(id){
    const next=String(selectedMember||'')===String(id)?'':String(id);
    if(next!==String(selectedMember||'')){
      const text=document.getElementById('commentText');
      if(text)text.value='';
    }
    selectedMember=next;
    render();
  };

  function bindCancel(){
    const cancel=document.getElementById('editCancel');
    if(!cancel)return;
    cancel.onclick=function(){
      selectedMember='';
      render();
    };
  }

  bindCancel();

  const originalRender=window.render;
  if(typeof originalRender==='function'){
    window.render=function(){
      const result=originalRender.apply(this,arguments);
      bindCancel();
      return result;
    };
  }
})();