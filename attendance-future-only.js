/* Show weekends, Japanese holidays and registered dates from today onward.
   Holiday rules: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
   Stored answers/events are not deleted; this only changes visibility. */
(function(){
  function formatDate(year,month,day){
    return String(year)+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }

  const japaneseHolidayCache=new Map();
  function japaneseHolidays(year){
    if(japaneseHolidayCache.has(year))return japaneseHolidayCache.get(year);
    const holidays=new Set();
    const add=function(month,day){holidays.add(formatDate(year,month-1,day))};
    const nthMonday=function(month,nth){
      const first=new Date(year,month-1,1).getDay();
      return 1+((8-first)%7)+(nth-1)*7;
    };
    add(1,1);
    add(1,nthMonday(1,2));
    add(2,11);
    if(year>=2020)add(2,23);
    add(3,Math.floor(20.8431+.242194*(year-1980)-Math.floor((year-1980)/4)));
    add(4,29);
    add(5,3);add(5,4);add(5,5);
    if(year===2020){add(7,23);add(7,24);add(8,10)}
    else if(year===2021){add(7,22);add(7,23);add(8,8)}
    else{add(7,nthMonday(7,3));add(8,11);add(10,nthMonday(10,2))}
    add(9,nthMonday(9,3));
    add(9,Math.floor(23.2488+.242194*(year-1980)-Math.floor((year-1980)/4)));
    add(11,3);add(11,23);
    for(let time=new Date(year,0,2).getTime(),end=new Date(year,11,30).getTime();time<=end;time+=86400000){
      const current=new Date(time);
      const key=formatDate(current.getFullYear(),current.getMonth(),current.getDate());
      if(holidays.has(key))continue;
      const previous=new Date(time-86400000),next=new Date(time+86400000);
      if(holidays.has(formatDate(previous.getFullYear(),previous.getMonth(),previous.getDate()))&&holidays.has(formatDate(next.getFullYear(),next.getMonth(),next.getDate())))holidays.add(key);
    }
    Array.from(holidays).sort().forEach(function(key){
      const parts=key.split('-').map(Number);
      const holiday=new Date(parts[0],parts[1]-1,parts[2]);
      if(holiday.getDay()!==0)return;
      let substitute=new Date(holiday.getFullYear(),holiday.getMonth(),holiday.getDate()+1);
      let substituteKey=formatDate(substitute.getFullYear(),substitute.getMonth(),substitute.getDate());
      while(holidays.has(substituteKey)){
        substitute=new Date(substitute.getFullYear(),substitute.getMonth(),substitute.getDate()+1);
        substituteKey=formatDate(substitute.getFullYear(),substitute.getMonth(),substitute.getDate());
      }
      holidays.add(substituteKey);
    });
    japaneseHolidayCache.set(year,holidays);
    return holidays;
  }


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
    // Dates are independent of schedule registration. Reuse the same stable
    // IDs as scheduled dates so answers survive later schedule additions.
    for(const day=new Date(start);day<=end;day.setDate(day.getDate()+1)){
      const date=formatDate(day.getFullYear(),day.getMonth(),day.getDate());
      if(day.getDay()!==0&&day.getDay()!==6&&!japaneseHolidays(day.getFullYear()).has(date))continue;
      if(!byDate.has(date))byDate.set(date,{id:'schedule_'+date.replaceAll('-',''),date,title:''});
    }
    return [...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  visibleEvents=futureOnlyVisibleEvents;
  if(typeof render==='function' && data && Array.isArray(data.events)) render();
})();