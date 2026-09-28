(()=>{'use strict';
const $=s=>document.querySelector(s);
function build(memberBtn){
 const board=$('#board'), table=memberBtn.closest('table'), row=memberBtn.closest('tr'), original=$('#editor');
 if(!board||!table||!row||!original)return;
 table.querySelectorAll('.safe-inline-comment-row').forEach(x=>x.remove());
 const tr=document.createElement('tr');tr.className='safe-inline-comment-row';
 const td=document.createElement('td');td.colSpan=row.children.length;
 const card=document.createElement('div');card.className='safe-inline-comment-card';
 const clone=original.cloneNode(true);clone.removeAttribute('id');clone.classList.add('show');
 const name=clone.querySelector('#editorName');if(name){name.removeAttribute('id');name.textContent=memberBtn.textContent.trim()}
 clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
 td.appendChild(card);card.appendChild(clone);tr.appendChild(td);row.insertAdjacentElement('afterend',tr);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-select-member]');if(!b)return;requestAnimationFrame(()=>build(b))},false);
})();