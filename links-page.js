(function(){
  const API='/.netlify/functions/site-data?section=links';
  const defaults=[
    {name:'日本リトルシニア中学硬式野球協会 関東連盟',url:'https://www.kantoleague.net/shop/sphone/'},
    {name:'日本リトルシニア 関東連盟 東関東支部',url:'https://www.kantoleague.net/shop/block/?action=detail&b_id=3'},
    {name:'超野球専門店CV',url:'https://www.spcv.jp'},
    {name:'Instagram',url:'https://www.instagram.com/yachiyo_little_senior/'},
    {name:'Facebook',url:'https://www.facebook.com/874baseball'}
  ];
  let links=defaults.map(x=>({...x}));
  const list=document.getElementById('linkList');
  const editor=document.getElementById('linkEditor');
  const status=document.getElementById('status');
  const adminBtn=document.getElementById('adminBtn');

  function safeUrl(value){
    try{const u=new URL(String(value||''));return /^https?:$/.test(u.protocol)?u.href:''}catch(e){return ''}
  }
  function clean(items){
    return (Array.isArray(items)?items:[]).map(x=>({name:String(x?.name||'').trim(),url:String(x?.url||'').trim()})).filter(x=>x.name||x.url);
  }
  function normalize(items){
    const normalized=clean(items).filter(item=>{
      // 専用ショップはチーム専用ページへ移動。保存済みリンクにも適用する。
      try{const url=new URL(item.url);return !(url.hostname.replace(/^www\./,'')==='sportscv.jp'&&url.pathname.replace(/\/$/,'')==='/p/auth/team_yachiyo-sr');}catch(e){return true;}
    }).map(item=>{
      if(item.url==='https://www.kantoleague.net/shop/sphone/')return {...item,name:'日本リトルシニア中学硬式野球協会 関東連盟'};
      if(item.name==='超野球専門店CV'&&/^https:\/\/www\.sportscv\.jp\/?$/.test(item.url))return {...item,url:'https://www.spcv.jp'};
      return item;
    });
    const leagueIndex=normalized.findIndex(item=>item.url==='https://www.kantoleague.net/shop/sphone/');
    const branchIndex=normalized.findIndex(item=>item.url==='https://www.kantoleague.net/shop/block/?action=detail&b_id=3');
    if(leagueIndex>branchIndex&&branchIndex>=0){const [league]=normalized.splice(leagueIndex,1);normalized.splice(branchIndex,0,league)}
    return normalized;
  }
  function render(){
    list.replaceChildren();
    const valid=links.filter(x=>x.name&&safeUrl(x.url));
    if(!valid.length){const p=document.createElement('div');p.className='empty';p.textContent='現在、公開中のリンクはありません。';list.appendChild(p);return}
    valid.forEach(item=>{
      const a=document.createElement('a');a.className='link-card';a.href=safeUrl(item.url);a.target='_blank';a.rel='noopener noreferrer';
      const title=document.createElement('span');title.className='link-title';title.textContent=item.name;
      const arrow=document.createElement('span');arrow.className='link-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';
      a.append(title,arrow);list.appendChild(a);
    });
  }
  function renderEditor(){
    editor.replaceChildren();
    links.forEach((item,index)=>{
      const row=document.createElement('div');row.className='editor-row';
      const name=document.createElement('textarea');name.rows=2;name.placeholder='表示名';name.value=item.name;name.dataset.i=index;name.dataset.k='name';
      const url=document.createElement('input');url.type='url';url.placeholder='https://';url.value=item.url;url.dataset.i=index;url.dataset.k='url';
      const del=document.createElement('button');del.type='button';del.className='delete';del.textContent='削除';del.dataset.del=index;
      row.append(name,url,del);editor.appendChild(row);
    });
  }
  async function load(){
    try{const r=await fetch(API,{cache:'no-store'});if(r.ok){const j=await r.json();if(Array.isArray(j.data)&&j.data.length)links=normalize(j.data)}}catch(e){}
    render();
  }
  async function openAdmin(){
    let p=sessionStorage.getItem('yachiyoAdminPassword')||'';
    if(!p)p=prompt('管理者パスワードを入力してください')||'';
    if(!p)return;
    status.textContent='確認中...';
    try{
      const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':p},body:JSON.stringify({data:links})});
      if(r.status===429){alert('試行回数の上限です。15分後に再度お試しください。');status.textContent='';return}
      if(r.status===401){alert('管理者パスワードが違います。');status.textContent='';return}
      if(!r.ok){alert('管理機能の接続設定を確認してください。');status.textContent='';return}
      sessionStorage.setItem('yachiyoAdminPassword',p);document.body.classList.add('editing');adminBtn.textContent='管理終了';renderEditor();status.textContent='';
    }catch(e){alert('管理機能に接続できませんでした。');status.textContent=''}
  }
  adminBtn.addEventListener('click',()=>{
    if(document.body.classList.contains('editing')){document.body.classList.remove('editing');sessionStorage.removeItem('yachiyoAdminPassword');adminBtn.textContent='管理';adminBtn.style.display='none';load();return}
    openAdmin();
  });
  document.getElementById('linkAdd').addEventListener('click',()=>{links.push({name:'',url:''});renderEditor()});
  editor.addEventListener('input',e=>{if(!e.target.dataset.k)return;links[Number(e.target.dataset.i)][e.target.dataset.k]=e.target.value});
  editor.addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;links.splice(Number(b.dataset.del),1);renderEditor()});
  document.getElementById('linkCancel').addEventListener('click',()=>{document.body.classList.remove('editing');adminBtn.textContent='管理';adminBtn.style.display='none';load()});
  document.getElementById('linkSave').addEventListener('click',async()=>{
    const next=clean(links);if(next.some(x=>!x.name||!safeUrl(x.url))){alert('表示名と正しいURLを入力してください。');return}
    const p=sessionStorage.getItem('yachiyoAdminPassword')||'';status.textContent='保存中...';
    try{const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':p},body:JSON.stringify({data:next})});if(r.status===429){alert('試行回数の上限です。15分後に再度お試しください。');status.textContent='';return}if(r.status===401){alert('管理者パスワードが違います。');status.textContent='';return}if(!r.ok){alert('保存できませんでした。');status.textContent='';return}links=next;render();renderEditor();status.textContent='保存しました。'}catch(e){alert('保存できませんでした。');status.textContent=''}
  });
  sessionStorage.removeItem('yachiyoAdminPassword');
load();
})();
