(function(){
  const button=document.getElementById('siteMenuButton');
  const menu=document.getElementById('siteMenu');
  if(!button||!menu)return;
  function setOpen(open){
    menu.classList.toggle('open',open);
    button.setAttribute('aria-expanded',open?'true':'false');
    button.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');
    button.textContent=open?'✕':'☰';
  }
  button.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    setOpen(!menu.classList.contains('open'));
  });
  menu.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click',function(){setOpen(false)});
  });
  document.addEventListener('click',function(e){
    if(menu.classList.contains('open')&&!e.target.closest('.site-header'))setOpen(false);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')setOpen(false);
  });
})();
