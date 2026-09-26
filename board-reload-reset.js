(function(){
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  // 履歴からの移動先は再読み込み時には引き継がない。
  const navigation=performance.getEntriesByType('navigation')[0];
  if(navigation&&navigation.type==='reload'){
    const url=new URL(location.href);
    ['focus','focusTitle','focusUpdatedAt'].forEach(function(key){url.searchParams.delete(key)});
    url.hash='';
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }

  window.addEventListener('pageshow',function(){
    window.scrollTo(0,0);
    requestAnimationFrame(function(){window.scrollTo(0,0)});
    setTimeout(function(){window.scrollTo(0,0)},120);
  });
})();
