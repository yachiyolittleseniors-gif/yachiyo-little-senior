(function(){
 const api='/.netlify/functions/site-data';
 const list=document.getElementById('newsList'), modal=document.getElementById('newsModal');
 const add=document.getElementById('newsAddBtn'), close=document.getElementById('newsClose'), save=document.getElementById('newsSave');
 const date=document.getElementById('newsDate'), title=document.getElementById('newsTitle'), body=document.getElementById('newsBody');
 const modalTitle=document.getElementById('newsModalTitle');
 let data=[],editingIndex=-1;
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(){
   data.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
   if(!data.length){list.innerHTML='<p class="news-empty">現在、新着NEWSはありません。</p>';return}
   list.innerHTML=data.map((x,i)=>'<article class="news-item"><div class="news-date">'+esc(x.date||'')+'</div><div class="news-title">'+esc(x.title)+'</div><div class="news-body">'+esc(x.body)+'</div><button class="news-edit" data-i="'+i+'">編集</button><button class="news-delete" data-i="'+i+'">削除</button></article>').join('');
   list.querySelectorAll('.news-edit').forEach(b=>b.onclick=()=>edit(Number(b.dataset.i)));
   list.querySelectorAll('.news-delete').forEach(b=>b.onclick=()=>remove(Number(b.dataset.i)));
 }
 async function load(){
   try{const r=await fetch(api+'?section=news',{cache:'no-store'});if(!r.ok)return;const j=await r.json();data=Array.isArray(j.data)?j.data:[];render()}catch(e){}
 }
 async function persist(){
   const pw=sessionStorage.getItem('yachiyoAdminPassword')||'';
   const r=await fetch(api+'?section=news',{method:'POST',headers:{'content-type':'application/json','x-admin-password':pw},body:JSON.stringify({data})});
   if(r.status===429)throw new Error('LIMITED');
   if(!r.ok)throw new Error();
 }
 add.onclick=()=>{editingIndex=-1;modalTitle.textContent='新着NEWSを追加';save.textContent='保存する';date.value=new Date().toISOString().slice(0,10);title.value='';body.value='';modal.hidden=false};
 function edit(i){
   const item=data[i];if(!item)return;
   editingIndex=i;modalTitle.textContent='新着NEWSを編集';save.textContent='変更を保存';
   date.value=item.date||'';title.value=item.title||'';body.value=item.body||'';modal.hidden=false;
 }
 close.onclick=()=>modal.hidden=true;
 modal.onclick=e=>{if(e.target===modal)modal.hidden=true};
 save.onclick=async()=>{
   if(!title.value.trim()){alert('タイトルを入力してください。');return}
   const old=data.slice();
   const item={id:editingIndex>=0?(data[editingIndex].id||Date.now()):Date.now(),date:date.value,title:title.value.trim(),body:body.value.trim()};
   if(editingIndex>=0)data[editingIndex]=item;else data.push(item);
   try{await persist();modal.hidden=true;editingIndex=-1;render();showSaveNotice('保存しました')}catch(e){data=old;alert(e.message==='LIMITED'?'試行回数の上限です。15分後に再度お試しください。':'保存できませんでした。')}
 };
 async function remove(i){if(!confirm('このNEWSを削除しますか？'))return;const old=data.slice();data.splice(i,1);try{await persist();render()}catch(e){data=old;alert(e.message==='LIMITED'?'試行回数の上限です。15分後に再度お試しください。':'削除できませんでした。')}}
 load();
})();
