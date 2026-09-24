(()=>{
 const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
 const cfg={
  'index.html':{title:'ホームページ管理',bodyClass:'photo-admin-on',selectors:['#heroPhotoAdmin','#seniorcupAdminControl','#recruitModeAdmin']},
  'team.html':{title:'チーム紹介 管理',bodyClass:'staff-editing',selectors:['#staffAdmin','#majorAchievementsAdmin','#pastAchievementsAdmin','#graduateAdmin','#teamInterviewAdmin']},
  'results.html':{title:'試合結果 管理',bodyClass:'admin-mode',selectors:['.results-admin-toolbar','#squadSettingsPanel','#panel']},
  'players.html':{title:'選手紹介 管理',bodyClass:'admin-mode',selectors:['.player-admin','#playerEditor']},
  'links.html':{title:'リンク集 管理',bodyClass:'editing',selectors:['#linkAdmin']},
  'seniorcup.html':{title:'八千代リトルシニア杯 管理',selectors:['#winnersAdmin','#guidelineAdminBox','#cupAdminArea']},
  'contact.html':{title:'お問い合わせ 管理',selectors:['#phoneAdminPanel']}
 }[page];
 if(!cfg)return;
 const items=[];
 cfg.selectors.forEach(s=>document.querySelectorAll(s).forEach(el=>{if(!items.includes(el))items.push(el)}));
 if(!items.length)return;
 const modal=document.createElement('div'); modal.id='yachiyoUnifiedAdminModal'; modal.setAttribute('aria-hidden','true');
 modal.innerHTML='<section id="yachiyoUnifiedAdminCard" role="dialog" aria-modal="true"><button id="yachiyoUnifiedAdminClose" type="button" aria-label="管理画面を閉じる">×</button><h2></h2><div id="yachiyoUnifiedAdminBody"></div></section>';
 document.body.appendChild(modal); modal.querySelector('h2').textContent=cfg.title;
 const body=modal.querySelector('#yachiyoUnifiedAdminBody');
 items.forEach(el=>body.appendChild(el));
 const visible=el=>!el.hidden && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden';
 const shouldOpen=()=> (cfg.bodyClass&&document.body.classList.contains(cfg.bodyClass)) || items.some(visible);
 const sync=()=>{const on=shouldOpen();modal.classList.toggle('is-open',on);modal.setAttribute('aria-hidden',on?'false':'true');document.body.classList.toggle('yachiyo-admin-popup-open',on)};
 const close=()=>{
   const candidates=['#heroAdminToggle','#staffToggle','#adminModeToggle','#adminToggle','#adminBtn','#cupAdminBtn'];
   for(const s of candidates){const b=document.querySelector(s);if(b&&/管理終了|終了/.test(b.textContent||'')){b.click();setTimeout(sync,0);return}}
   items.forEach(el=>{if('hidden' in el)el.hidden=true;el.classList.remove('show','open','is-open')}); sync();
 };
 modal.querySelector('#yachiyoUnifiedAdminClose').addEventListener('click',close);
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 new MutationObserver(()=>requestAnimationFrame(sync)).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style','hidden','aria-hidden']});
 document.addEventListener('click',()=>setTimeout(sync,30),true); setTimeout(sync,0);
})();
