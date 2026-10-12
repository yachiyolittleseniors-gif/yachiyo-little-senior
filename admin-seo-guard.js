(()=>{
  'use strict';

  const entrySelector=[
    '#heroAdminToggle',
    '#adminToggle',
    '#adminModeToggle',
    '#staffEditBtn',
    '#contactAdminBtn',
    '#adminBtn',
    '#cupAdminBtn'
  ].join(',');

  const route=(location.pathname||'/')
    .replace(/\/index\.html$/,'/')
    .replace(/\.html$/,'')
    .replace(/\/$/,'')||'/';

  const selectorsByRoute={
    '/':['#seniorcupAdminControl','#newsAddBtn','#newsModal','#heroAnnouncementModal','.groundPhotoAdminActions','#recruitModeAdmin','#calendarEditor','#heroPhotoAdmin','#heroImageEditModal'],
    '/players':['.player-admin','#playerEditor','.player-delete','.player-edit'],
    '/results':['.results-admin-toolbar','#squadSettingsPanel','#panel','.tournament-name-edit','.tournament-pdf-delete','.tournament-pdf-save-menu','.game-edit','.delete','.tournament-pdf-add'],
    '/schedule':['#annualAdminBtn','#calendarEditor','#annualEditor'],
    '/team':['#staffAdmin','#majorAchievementsAdmin','#graduateAdmin','#teamMovieAdmin','#teamInterviewAdmin','#calendarEditor'],
    '/join':['#calendarEditor'],
    '/contact':['#phoneAdminPanel'],
    '/links':['#linkAdmin'],
    '/seniorcup':['#winnersAdmin','#guidelineAdminBox','#cupAdminArea']
  };

  const selectors=selectorsByRoute[route]||[];
  if(!selectors.length)return;

  const savedText=new Map();
  let restored=false;
  let scheduled=false;
  let observer=null;
  let bodyObserver=null;

  function isEntryText(node){
    const parent=node&&node.parentElement;
    return Boolean(parent&&parent.closest(entrySelector));
  }

  function scrubRoot(root){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(!node.nodeValue||!node.nodeValue.trim()||isEntryText(node))continue;
      const parent=node.parentElement;
      if(parent&&parent.closest('script,style,noscript'))continue;
      savedText.set(node,node.nodeValue);
      node.nodeValue='';
    }
  }

  function scrub(){
    if(restored)return;
    for(const selector of selectors){
      document.querySelectorAll(selector).forEach(scrubRoot);
    }
  }

  function restore(){
    if(restored)return;
    restored=true;
    savedText.forEach((value,node)=>{
      if(node&&node.isConnected)node.nodeValue=value;
    });
    savedText.clear();
    if(observer)observer.disconnect();
    if(bodyObserver)bodyObserver.disconnect();
  }

  function scheduleScrub(){
    if(restored||scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      scrub();
    });
  }

  document.addEventListener('click',event=>{
    const target=event.target&&event.target.closest?event.target.closest(entrySelector):null;
    if(target)restore();
  },true);

  document.addEventListener('yachiyo:admin-session-active',restore,{once:true});

  function start(){
    scrub();
    if(!document.body)return;

    observer=new MutationObserver(scheduleScrub);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});

    bodyObserver=new MutationObserver(()=>{
      if(restored)return;
      const body=document.body;
      if(!body)return;
      const flags=['admin-mode','staff-editing','photo-admin-on','admin-on'];
      if(flags.some(name=>body.classList.contains(name)))restore();
    });
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();