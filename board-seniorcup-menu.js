(()=>{
  const menus=document.querySelectorAll('.mobile-links,.site-menu');
  if(!menus.length)return;
  const links=[];
  menus.forEach(menu=>{
    let link=menu.querySelector('[data-seniorcup-menu-link]');
    if(!link){
      link=document.createElement('a');
      link.href='./seniorcup';
      link.textContent='八千代リトルシニア杯';
      link.setAttribute('data-seniorcup-menu-link','');
      const termsLink=[...menu.querySelectorAll('a')].find(item=>{
        const href=item.getAttribute('href')||'';
        return /(?:terms|site-policy)\.html(?:$|[?#])/.test(href)||item.textContent.includes('サイト利用について');
      });
      if(termsLink)menu.insertBefore(link,termsLink);
      else menu.appendChild(link);
    }
    links.push(link);
  });

  function apply(visible){
    links.forEach(link=>{
      if(visible)link.style.removeProperty('display');
      else link.style.setProperty('display','none','important');
      link.setAttribute('aria-hidden',visible?'false':'true');
    });
  }

  let visible=true;
  try{visible=localStorage.getItem('yachiyoSeniorCupVisible')!=='false'}catch(e){}
  apply(visible);

  fetch('/.netlify/functions/site-data?section=seniorcup-settings',{cache:'no-store'})
    .then(response=>response.ok?response.json():null)
    .then(json=>{
      if(json&&json.data&&typeof json.data.visible==='boolean'){
        visible=json.data.visible;
        try{localStorage.setItem('yachiyoSeniorCupVisible',String(visible))}catch(e){}
        apply(visible);
      }
    })
    .catch(()=>{});

  new MutationObserver(()=>{
    if(document.documentElement.classList.contains('seniorcup-hidden'))apply(false);
    else if(document.querySelector('.seniorcup-home-banner'))apply(true);
  }).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
