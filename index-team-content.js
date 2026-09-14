(async function(){
  const api='/.netlify/functions/site-data';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function get(section){
    try{
      const r=await fetch(`${api}?section=${section}`,{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        return Array.isArray(j.data)?j.data:[];
      }
    }catch(e){}
    return [];
  }
  try{
    const [schedule,results]=await Promise.all([get('schedule'),get('results')]);
    const now=new Date(); now.setHours(0,0,0,0);

    const dateKey=v=>String(v??'').trim().replace(/[./]/g,'-').replace(/年|月/g,'-').replace(/日/g,'').split('T')[0];
    const todayKey=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    const upcoming=schedule
      .filter(x=>x && x.date && dateKey(x.date)>=todayKey)
      .sort((a,b)=>dateKey(a.date).localeCompare(dateKey(b.date)))[0];
    const sc=document.querySelector('#latestScheduleCard .latest-meta');
    const scheduleGradeIcon=(date,grade)=>{
      const parts=String(date||'').split('-').map(Number);
      const year=parts[0]||now.getFullYear();
      const month=parts[1]||now.getMonth()+1;
      const academicYear=month>=4?year:year-1;
      const shift=((academicYear-2026)%3+3)%3;
      const index=((Number(grade)-1-shift)%3+3)%3;
      return ['🔴','🟢','🔵'][index];
    };
    const scheduleGradeText=x=>{
      const grades=Array.isArray(x&&x.grades)?x.grades.map(String).filter(v=>['1','2','3'].includes(v)):[];
      if(grades.length===3)return '🟡全学年';
      return grades.map(v=>scheduleGradeIcon(x&&x.date,v)+v+'年生').join('・');
    };
    const upcomingGrades=scheduleGradeText(upcoming);
    sc.innerHTML=upcoming
      ? `<strong>${esc(upcoming.date.replace(/-/g,'/'))}</strong>${upcomingGrades?'<br>'+esc(upcomingGrades):''}<br>${esc(upcoming.title)}${upcoming.time?'<br>'+esc(upcoming.time):''}${upcoming.place?'<br>'+esc(upcoming.place):''}<br><a class="latest-link" href="./schedule">スケジュールを見る →</a>`
      : `現在、公開スケジュールはありません。<br><a class="latest-link" href="./schedule">スケジュールを見る →</a>`;

    const cleanResults=[...results].filter(x=>x&&x.date);
    const latestR=cleanResults.sort((a,b)=>{
      const byDate=dateKey(b.date).localeCompare(dateKey(a.date));
      if(byDate)return byDate;
      return String(b.id||'').localeCompare(String(a.id||''));
    })[0];
    const rc=document.querySelector('#latestResultCard .latest-meta');
    if(latestR){
      const yachiyoFirst=latestR.battingOrder!=='second';
      const leftName=yachiyoFirst?'八千代':String(latestR.opponent||'');
      const rightName=yachiyoFirst?String(latestR.opponent||''):'八千代';
      const leftScore=yachiyoFirst?Number(latestR.ourScore):Number(latestR.oppScore);
      const rightScore=yachiyoFirst?Number(latestR.oppScore):Number(latestR.ourScore);
      rc.innerHTML=
        `${latestR.grade?`<span class="latest-grade">${esc(latestR.grade)}</span>`:''}`+
        `<strong>${esc((latestR.date||'').replace(/-/g,'/'))}</strong><br>`+
        `${esc(latestR.tournament||'試合')}<br>`+
        `<span class="latest-match">${esc(leftName)} <b>${leftScore} - ${rightScore}</b> ${esc(rightName)}</span>`+
        `${latestR.venue?`<br><span class="latest-venue">会場：${esc(latestR.venue)}</span>`:''}`+
        `<br><a class="latest-link" href="./results">試合結果を見る →</a>`;
    }else{
      rc.innerHTML=`まだ試合結果は登録されていません。<br><a class="latest-link" href="./results">試合結果を見る →</a>`;
    }
  }catch(e){
    document.querySelectorAll('.latest-meta').forEach(el=>el.textContent='最新情報を読み込めませんでした。');
  }
})();
