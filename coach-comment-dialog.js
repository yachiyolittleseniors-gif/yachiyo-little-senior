(()=>{'use strict';
const q=s=>document.querySelector(s);
function init(){
 const d=q('#commentQuickDialog');if(!d)return;
 const open=b=>{q('#quickCommentName').textContent=b.textContent.trim();const src=q('#commentEventDate'),dst=q('#quickCommentDate');dst.innerHTML=src?src.innerHTML:'';dst.value=src?.value||'';q('#quickCommentText').value='';d.showModal();};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-select-member]');if(b)setTimeout(()=>open(b),0)},true);
 const close=()=>d.close();q('#quickCommentClose').addEventListener('click',close);q('#quickCommentCancel').addEventListener('click',close);
 q('#quickCommentSave').addEventListener('click',()=>{const original=q('#commentText'),date=q('#commentEventDate'),save=q('#commentSave'),text=q('#quickCommentText').value.trim();if(!text)return;if(original)original.value=text;if(date&&q('#quickCommentDate').value)date.value=q('#quickCommentDate').value;if(save){save.click();close();}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();