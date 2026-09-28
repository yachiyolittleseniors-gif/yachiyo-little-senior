(()=>{'use strict';
const q=s=>document.querySelector(s);
function init(){
 const d=q('#commentQuickDialog');if(!d)return;
 let selectedButton=null;
 const ensureButton=()=>{
   const editor=q('#editor');if(!editor)return;
   let btn=q('#openQuickComment');
   if(!btn){btn=document.createElement('button');btn.type='button';btn.id='openQuickComment';btn.className='secondary';btn.textContent='コメント';btn.style.marginTop='10px';editor.appendChild(btn);}
   btn.hidden=!q('#board .member-btn.selected[data-select-member]');
   btn.onclick=()=>{selectedButton=q('#board .member-btn.selected[data-select-member]');if(!selectedButton)return;q('#quickCommentName').textContent=selectedButton.textContent.trim();const src=q('#commentEventDate'),dst=q('#quickCommentDate');dst.innerHTML=src?src.innerHTML:'';dst.value=src?.value||'';q('#quickCommentText').value='';d.showModal();};
 };
 document.addEventListener('click',e=>{if(e.target.closest('[data-select-member]'))setTimeout(ensureButton,0)},true);
 const board=q('#board');if(board)new MutationObserver(()=>queueMicrotask(ensureButton)).observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 const close=()=>d.close();q('#quickCommentClose').addEventListener('click',close);q('#quickCommentCancel').addEventListener('click',close);
 q('#quickCommentSave').addEventListener('click',()=>{const original=q('#commentText'),date=q('#commentEventDate'),save=q('#commentSave'),text=q('#quickCommentText').value.trim();if(!text)return;if(original)original.value=text;if(date&&q('#quickCommentDate').value)date.value=q('#quickCommentDate').value;if(save){save.click();close();}});
 ensureButton();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();