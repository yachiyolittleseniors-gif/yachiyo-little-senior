(()=>{
'use strict';
const $=s=>document.querySelector(s);
let selected='', panel=null, anchor=null;
function ensure(){
 if(panel)return panel;
 panel=document.createElement('div');panel.id='safeCommentPopover';panel.hidden=true;
 panel.innerHTML='<button type="button" class="scp-close" aria-label="閉じる">×</button><div class="scp-title"></div><label class="scp-label">対象日<select class="scp-date"></select></label><textarea class="scp-text" maxlength="500" placeholder="コメントを入力（例：車出しできます／AM・PMのみ参加可能）"></textarea><div class="scp-actions"><button type="button" class="scp-cancel">キャンセル</button><button type="button" class="scp-save">保存</button></div>';
 document.body.appendChild(panel);
 panel.querySelector('.scp-close').onclick=close;panel.querySelector('.scp-cancel').onclick=close;
 return panel;
}
function close(){if(panel)panel.hidden=true;selected='';anchor=null}
function position(){if(!panel||panel.hidden||!anchor)return;const r=anchor.getBoundingClientRect(),w=Math.min(620,innerWidth-20),pad=10;const left=Math.max(pad,Math.min(r.left,innerWidth-w-pad));const top=r.bottom+10;panel.style.width=w+'px';panel.style.left=left+'px';panel.style.top=top+'px';}
function openFor(btn){
 selected=btn.dataset.selectMember||'';anchor=btn;const p=ensure();p.querySelector('.scp-title').textContent=btn.textContent.trim();p.hidden=false;position();
 const original=$('#editor');if(original){const sel=original.querySelector('#commentEventDate'),dst=p.querySelector('.scp-date');dst.innerHTML=sel?sel.innerHTML:'';dst.value=sel?.value||'';p.querySelector('.scp-text').value='';}
}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-select-member]');if(!btn)return;setTimeout(()=>openFor(btn),0)},true);
addEventListener('resize',position);addEventListener('scroll',position,{passive:true});
})();