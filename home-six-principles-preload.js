(()=>{
  const warm=()=>{
    const img=document.querySelector('img[data-early-lazy="six-principles"]');
    if(!img)return;
    img.fetchPriority='high';
    // Setting eager only when the section is approaching avoids competing with the hero at first paint.
    img.loading='eager';
  };
  const img=document.querySelector('img[data-early-lazy="six-principles"]');
  if(!img)return;
  if(!('IntersectionObserver' in window)){return}
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){warm();observer.disconnect()}
  },{rootMargin:'900px 0px'});
  observer.observe(img);
})();
