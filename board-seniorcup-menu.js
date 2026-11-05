(()=>{
  const menus=document.querySelectorAll('.mobile-links,.site-menu');
  if(!menus.length)return;
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
    // Keep the hamburger link available independently of the home banner.
    link.style.removeProperty('display');
    link.setAttribute('aria-hidden','false');
  });
})();
