/* Keep attendance input tables focused on today and future dates.
   Stored answers/events are not deleted; this only changes visibility. */
(function(){
  function futureOnlyVisibleEvents(){
    const now=new Date(),start=new Date(now),end=new Date(now);
    start.setHours(0,0,0,0);
    end.setMonth(end.getMonth()+1);
    const withinRange=item=>{
      const date=new Date(String(item?.date||'')+'T00:00:00');
      return !Number.isNaN(date.getTime())&&date>=start&&date<=end;
    };
    const byDate=new Map(data.events.filter(withinRange).map(item=>[String(item.date),item]));
    for(const item of scheduleEvents.filter(withinRange)){
      const date=String(item.date),existing=byDate.get(date);
      byDate.set(date,existing?{...existing,title:existing.title||item.title}:{id:'schedule_'+date.replaceAll('-',''),date,title:item.title||'予定'});
    }
    return [...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  visibleEvents=futureOnlyVisibleEvents;
  if(typeof render==='function' && data && Array.isArray(data.events)) render();
})();