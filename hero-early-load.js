(()=>{'use strict';
window.__yachiyoHeroResponse=fetch('/.netlify/functions/site-data?section=hero&manifest=1',{cache:'no-store'})
 .then(response=>{
  if(response.ok)response.clone().json().then(data=>{
   const src=data&&data.data&&data.data[0]&&data.data[0].image;
   if(!src)return;
   const image=new Image();image.fetchPriority='high';image.src=src;
   window.__yachiyoHeroPreload=image;
  }).catch(()=>{});
  return response;
 }).catch(()=>null);
})();