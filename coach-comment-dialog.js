(()=>{'use strict';
const q=s=>document.querySelector(s);
function init(){
 const d=q('#commentQuickDialog');if(!d)return;
 const open=()=>{const b=q('#board .member-btn.selected[data-select-member]');if(!b)return;q('#quickCommentName').textContent=b.textContent.trim();const src=q('#commentEventDate'),dst=q('#quickCommentDate');dst.innerHTML=src?src.innerHTML:'';dst.value=src?.value||'';q('#quickCommentText').value='';d.showModal();};
 const ensureButton=()=>{const editor=q('#editor');if(!editor)return;let btn=q('#openQuickComment');if(!btn){btn=document.createElement('button');btn.type='button';btn.id='openQuickComment';btn.textContent='コメントを入力';btn.className='small-btn';btn.style.cssText='display:block;width:100%;margin:10px 0 0;min-height:48px';const p=editor.querySelector('p');(p||editor.firstChild)?.after?.(btn);if(!btn.parentNode)editor.appendChild(btn);btn.addEventListener('click',open)}btn.style.display=q('#board .member-btn.selected[data-select-member]')?'block':'none';};
 document.addEventListener('click',e=>{if(e.target.closest('[data-select-member]'))setTimeout(ensureButton,50)},true);
 const close=()=>d.close();q('#quickCommentClose').addEventListener('click',close);q('#quickCommentCancel').addEventListener('click',close);
 q('#quickCommentSave').addEventListener('click',()=>{const original=q('#commentText'),date=q('#commentEventDate'),save=q('#commentSave'),text=q('#quickCommentText').value.trim();if(!text)return;if(original)original.value=text;if(date&&q('#quickCommentDate').value)date.value=q('#quickCommentDate').value;if(save){save.click();close();}});
 ensureButton();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();