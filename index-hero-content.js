(async function(){
  const api='/.netlify/functions/site-data';
  const hero=document.querySelector('.hero');
  const toggle=document.getElementById('heroAdminToggle');
  const change=document.getElementById('heroPhotoChange');
  const accessPasswordChange=document.getElementById('accessPasswordChange');
  const input=document.getElementById('heroPhotoInput');
  const adminPanel=document.getElementById('heroPhotoAdmin');
  if(!hero||!toggle||!change||!accessPasswordChange||!input||!adminPanel)return;

  async function loadHero(){
    try{
      const r=await fetch(api+'?section=hero&manifest=1',{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        const d=Array.isArray(j.data)?j.data:[];
        if(d[0]&&d[0].image){
          window.__yachiyoPhotoCache&&window.__yachiyoPhotoCache.set('hero',d[0].image);
          hero.style.setProperty('--hero-photo',`url("${d[0].image}")`);
        }
      }
    }catch(e){}

  }
  loadHero();

  function setAdmin(on){
    document.body.classList.toggle('photo-admin-on',on);
    if(on){
      sessionStorage.setItem('yachiyoAdminMode','1');
      change.style.display='inline-block';
      accessPasswordChange.style.display='inline-block';
      adminPanel.style.setProperty('display',window.matchMedia('(max-width:600px)').matches?'grid':'flex','important');
      toggle.textContent='管理終了';
    }else{
      sessionStorage.removeItem('yachiyoAdminMode');
      sessionStorage.removeItem('yachiyoAdminPassword');
      change.style.display='none';
      accessPasswordChange.style.display='none';
      toggle.textContent='管理';
    }
  }

  // ページ更新・再読み込み時は必ず管理状態とパスワードを解除
  sessionStorage.removeItem('yachiyoAdminMode');
  sessionStorage.removeItem('yachiyoAdminPassword');
  document.body.classList.remove('photo-admin-on');
  document.getElementById('heroPhotoAdmin').style.display='none';
  change.style.display='none';
  accessPasswordChange.style.display='none';
  toggle.textContent='管理';

  // Hidden admin entrance: コピーライトを2秒以内に5回タップ
  let secretTapCount=0, secretTapTimer=null;
  const footer=document.querySelector('.restored-footer-copy');
  if(footer){
    footer.addEventListener('pointerup',function(e){
      if(e.target.closest('#heroPhotoAdmin'))return;
      secretTapCount++;
      clearTimeout(secretTapTimer);
      secretTapTimer=setTimeout(()=>{secretTapCount=0},2000);
      if(secretTapCount>=5){
        secretTapCount=0;
        clearTimeout(secretTapTimer);
        document.getElementById('heroPhotoAdmin').style.display='flex';
      }
    },{passive:true});
  }

  toggle.addEventListener('click',async function(){
    if(sessionStorage.getItem('yachiyoAdminMode')==='1'){setAdmin(false);document.getElementById('heroPhotoAdmin').style.display='none';return;}
    const pw=prompt('管理パスワードを入力してください');
    if(!pw)return;
    toggle.disabled=true;
    try{
      const r=await fetch(api+'?section=access-settings',{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':pw},
        body:JSON.stringify({action:'verifyAdminPassword'})
      });
      if(r.status===429){alert('試行回数の上限です。15分後に再度お試しください。');return}
      if(r.status===401){alert('管理者パスワードが違います。');return}
      if(r.status===503){alert('Netlifyの管理者パスワード設定を確認してください。');return}
      if(!r.ok)throw new Error();
      sessionStorage.setItem('yachiyoAdminPassword',pw);
      setAdmin(true);
    }catch(e){alert('管理者パスワードを確認できませんでした。通信状況を確認してください。')}
    finally{toggle.disabled=false}
  });

  accessPasswordChange.addEventListener('click',async function(){
    const adminPassword=sessionStorage.getItem('yachiyoAdminPassword')||'';
    if(!adminPassword){
      alert('管理者パスワードを入力し直してください。');
      return;
    }
    const next=prompt('チーム専用ページの新しいパスワードを入力してください。\n（8文字以上64文字以内）');
    if(next===null)return;
    if(next.length<8||next.length>64){
      alert('新しいパスワードは8文字以上64文字以内で入力してください。');
      return;
    }
    const confirmation=prompt('確認のため、新しいパスワードをもう一度入力してください。');
    if(confirmation===null)return;
    if(next!==confirmation){
      alert('新しいパスワードが一致しません。');
      return;
    }
    if(!confirm('チーム専用ページの閲覧パスワードを変更しますか？'))return;

    accessPasswordChange.disabled=true;
    const originalText=accessPasswordChange.textContent;
    accessPasswordChange.textContent='変更中…';
    try{
      const r=await fetch(api+'?section=access-settings',{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':adminPassword},
        body:JSON.stringify({action:'setAccessPassword',password:next})
      });
      if(r.status===429){
        alert('試行回数の上限です。15分後に再度お試しください。');
        return;
      }
      if(r.status===401){
        alert('管理者パスワードが違います。');
        return;
      }
      if(!r.ok){
        alert('閲覧パスワードを変更できませんでした。');
        return;
      }
      sessionStorage.setItem('yachiyoAttendancePass',next);
      showSaveNotice('保存しました');
    }catch(e){
      alert('通信エラーのため、閲覧パスワードを変更できませんでした。');
    }finally{
      accessPasswordChange.disabled=false;
      accessPasswordChange.textContent=originalText;
    }
  });

  function compress(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=reject;
      reader.onload=()=>{
        const img=new Image();
        img.onerror=reject;
        img.onload=()=>{
          const max=1600, scale=Math.min(1,max/Math.max(img.width,img.height));
          const c=document.createElement('canvas');
          c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
          c.getContext('2d').drawImage(img,0,0,c.width,c.height);
          resolve(c.toDataURL('image/jpeg',.76));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  input.addEventListener('change',async function(){
    const file=input.files&&input.files[0]; if(!file)return;
    change.textContent='保存中…';
    try{
      const image=await compress(file);
      const pw=sessionStorage.getItem('yachiyoAdminPassword')||'';
      const r=await fetch(api+'?section=hero',{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':pw},
        body:JSON.stringify({data:[{image,updatedAt:new Date().toISOString()}]})
      });
      if(r.status===429)throw new Error('LIMITED');
      if(!r.ok)throw new Error('save failed');
     window.__yachiyoPhotoDataPromise=null;
       window.__yachiyoPhotoDataPromise=null;
      window.__yachiyoPhotoCache&&window.__yachiyoPhotoCache.set('hero',image);
       hero.style.setProperty('--hero-photo',`url("${image}")`);
      showSaveNotice('保存しました');
    }catch(e){
      alert(e.message==='LIMITED'?'試行回数の上限です。15分後に再度お試しください。':'保存できませんでした。管理パスワードを確認してください。');
    }finally{
      change.textContent='写真を変更'; input.value='';
    }
  });
})();
