(function(){
  try{
    var raw=localStorage.getItem('yachiyoHeroCropV3');
    if(!raw)return;
    var d=JSON.parse(raw);
    var x=Math.max(0,Math.min(100,Number(d.x)));
    var y=Math.max(0,Math.min(100,Number(d.y)));
    var zoom=Math.max(100,Math.min(220,Number(d.zoom)));
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(zoom))return;
    var root=document.documentElement.style;
    root.setProperty('--hero-saved-x',x+'%');
    root.setProperty('--hero-saved-y',y+'%');
    root.setProperty('--hero-saved-zoom',zoom+'%');
  }catch(e){}
})();
