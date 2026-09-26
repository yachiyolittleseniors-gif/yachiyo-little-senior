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
    // HOMEは編集日時ではなく、日本時間の今日以降で最も近い予定を表示する。
    const japanDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const todayKey=['year','month','day'].map(type=>japanDate.find(part=>part.type===type).value).join('-');
    const scheduleDateKey=value=>{
      const match=dateKey(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if(!match)return '';
      const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
      const date=new Date(Date.UTC(year,month-1,day));
      if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return '';
      return [match[1],String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
    };
    const upcoming=schedule
      .map((item,index)=>({item,index,key:scheduleDateKey(item&&item.date)}))
      .filter(entry=>entry.key && entry.key>=todayKey)
      .sort((a,b)=>{
        const byDate=a.key.localeCompare(b.key);
        return byDate||a.index-b.index;
      })[0]?.item;
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
      const grades=Array.isArray(x&&x.grades)?[...new Set(x.grades.map(String).filter(v=>['1','2','3','other'].includes(v)))]:[];
      const schoolGrades=grades.filter(v=>['1','2','3'].includes(v));
      const labels=[];
      if(schoolGrades.length===3)labels.push('🟡全学年');
      else labels.push(...schoolGrades.map(v=>scheduleGradeIcon(x&&x.date,v)+v+'年生'));
      if(grades.includes('other'))labels.push('⚫️その他');
      return labels.join('・');
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

    // SEO: mirror visible current data into machine-readable structured data.
    const graph=[];
    if(upcoming){
      graph.push({
        '@type':'SportsEvent',
        name:'八千代リトルシニア '+String(upcoming.title||'活動予定'),
        startDate:String(upcoming.date||'')+(upcoming.time&&/^\\d{1,2}:\\d{2}/.test(upcoming.time)?'T'+upcoming.time.match(/^\\d{1,2}:\\d{2}/)[0]+':00+09:00':''),
        location:upcoming.place?{'@type':'Place',name:String(upcoming.place)}:undefined,
        organizer:{'@id':'https://yachiyo-little-senior.netlify.app/#organization'},
        url:'https://yachiyo-little-senior.netlify.app/schedule'
      });
    }
    if(latestR){
      graph.push({
        '@type':'SportsEvent',
        name:String(latestR.tournament||'試合')+' 八千代リトルシニア vs '+String(latestR.opponent||'対戦相手'),
        startDate:String(latestR.date||''),
        location:latestR.venue?{'@type':'Place',name:String(latestR.venue)}:undefined,
        competitor:[
          {'@type':'SportsTeam','name':'八千代リトルシニア'},
          {'@type':'SportsTeam','name':String(latestR.opponent||'対戦相手')}
        ],
        description:'試合結果：八千代 '+String(latestR.ourScore)+' - '+String(latestR.oppScore)+' '+String(latestR.opponent||''),
        url:'https://yachiyo-little-senior.netlify.app/results'
      });
    }
    const modifiedCandidates=[
      upcoming&&upcoming.updatedAt,
      latestR&&latestR.updatedAt,
      latestR&&latestR.date,
      upcoming&&upcoming.date
    ].filter(Boolean).map(String).sort();
    const dateModified=modifiedCandidates.at(-1)||todayKey;
    graph.push({
      '@type':'WebPage',
      '@id':'https://yachiyo-little-senior.netlify.app/#webpage',
      url:'https://yachiyo-little-senior.netlify.app/',
      name:'八千代リトルシニア【公式】',
      dateModified:dateModified,
      isPartOf:{'@id':'https://yachiyo-little-senior.netlify.app/#website'},
      about:{'@id':'https://yachiyo-little-senior.netlify.app/#organization'}
    });
    let seo=document.getElementById('homeDynamicStructuredData');
    if(!seo){seo=document.createElement('script');seo.id='homeDynamicStructuredData';seo.type='application/ld+json';document.head.appendChild(seo)}
    seo.textContent=JSON.stringify({'@context':'https://schema.org','@graph':graph});
  }catch(e){
    document.querySelectorAll('.latest-meta').forEach(el=>el.textContent='最新情報を読み込めませんでした。');
  }
})();
