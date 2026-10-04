(()=>{
  'use strict';

  const API='/.netlify/functions/site-data?section=schedule';
  let schedulePromise=null;
  let scheduleCache=[];

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function loadSchedule(){
    if(schedulePromise)return schedulePromise;
    schedulePromise=fetch(API,{cache:'no-store'})
      .then(response=>response.ok?response.json():Promise.reject(new Error('schedule')))
      .then(body=>{
        scheduleCache=Array.isArray(body?.data)?body.data:[];
        return scheduleCache;
      })
      .catch(()=>{scheduleCache=[];return[]});
    return schedulePromise;
  }

  function formatDate(date){
    const value=String(date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return'';
    const d=new Date(value+'T00:00:00');
    if(Number.isNaN(d.getTime()))return'';
    return (d.getMonth()+1)+'/'+d.getDate()+'('+['日','月','火','水','木','金','土'][d.getDay()]+')';
  }

  function gradeLabel(event){
    const grades=Array.isArray(event?.grades)?event.grades.map(String):[];
    const school=['1','2','3'].filter(grade=>grades.includes(grade));
    let text='';
    if(school.length===3)text='全学年';
    else if(school.length)text=school.map(grade=>grade+'年生').join('・');
    if(grades.includes('other'))text+=(text?'・':'')+'その他';
    return text;
  }

  function detailRows(event){
    const rows=[];
    const title=String(event?.title||'').trim();
    const grade=gradeLabel(event);
    if(title)rows.push(['予定',title]);
    const time=String(event?.time||'').trim();
    const place=String(event?.place||'').trim();
    const memo=String(event?.memo||'').trim();

    if(grade)rows.push(['対象学年',grade]);
    if(time)rows.push(['時間',time]);
    if(place)rows.push(['グラウンド',place]);
    if(memo){
      const category=String(event?.category||'');
      rows.push([category==='official'||category==='friendly'?'対戦相手・詳細':'詳細',memo]);
    }
    return rows;
  }

  function installStyle(){
    if(document.getElementById('attendance-schedule-summary-style'))return;
    const style=document.createElement('style');
    style.id='attendance-schedule-summary-style';
    style.textContent=
      '.attendance-schedule-meta,.attendance-report-schedule-meta{margin:8px 0 12px;padding:8px 10px;border-top:1px solid rgba(199,154,59,.35);border-bottom:1px solid rgba(199,154,59,.35);background:#fffdf7}' +
      '.attendance-schedule-meta-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 14px;margin:0;color:#596474;font-size:11px;font-weight:800;line-height:1.55;overflow-wrap:anywhere}' +
      '.attendance-schedule-meta-line+.attendance-schedule-meta-line{margin-top:2px}' +
      '.attendance-schedule-meta-line b{color:#8b671d;white-space:nowrap}' +
      '.attendance-schedule-meta-item{display:inline-block;white-space:nowrap}' +
      '.summary-dialog .attendance-schedule-meta{margin:0 0 10px;padding:8px 0;border-left:0;border-right:0}' +
      '.summary-dialog .attendance-schedule-meta-line{font-size:11px}' +
      '@media(max-width:420px){.attendance-schedule-meta-line{font-size:10.5px;line-height:1.5}}';
    document.head.appendChild(style);
  }

  function compactScheduleGroups(event,includeTitle){
    const title=String(event?.title||'').trim();
    const grade=gradeLabel(event);
    const time=String(event?.time||'').trim();
    const place=String(event?.place||'').trim();
    const memo=String(event?.memo||'').trim();
    const detailLabel=['official','friendly'].includes(String(event?.category||''))?'対戦・詳細':'詳細';

    const first=[];
    const second=[];
    if(includeTitle&&title)first.push('予定：'+title);
    if(grade)first.push('対象：'+grade);
    if(time)first.push('時間：'+time);
    if(place)second.push('場所：'+place);
    if(memo)second.push(detailLabel+'：'+memo);

    return [first,second].filter(group=>group.length);
  }

  function compactScheduleHtml(event,includeTitle){
    const groups=compactScheduleGroups(event,includeTitle);
    return groups.map((group,lineIndex)=>{
      const items=group.map(item=>
        '<span class="attendance-schedule-meta-item">'+esc(item)+'</span>'
      ).join('');
      return '<p class="attendance-schedule-meta-line">'+(lineIndex===0?'<b>予定情報</b>':'')+items+'</p>';
    }).join('');
  }

  async function injectForButton(button){
    const dialog=document.getElementById('summaryDialog');
    const body=document.getElementById('summaryBody');
    if(!dialog||!body)return;

    body.querySelector('.attendance-schedule-meta')?.remove();

    const dateText=button.querySelector('.event-date')?.textContent?.trim()||'';
    if(!dateText)return;

    const schedule=await loadSchedule();
    const event=schedule.find(item=>formatDate(item?.date)===dateText);
    if(!event)return;

    const compact=compactScheduleHtml(event,false);
    if(!compact)return;

    installStyle();
    const section=document.createElement('section');
    section.className='attendance-schedule-meta';
    section.innerHTML=compact;
    body.prepend(section);
  }

  function fitCanvasText(ctx,text,maxWidth){
    const value=String(text||'');
    if(ctx.measureText(value).width<=maxWidth)return value;
    let out=value;
    while(out.length>1&&ctx.measureText(out+'…').width>maxWidth)out=out.slice(0,-1);
    return out+'…';
  }

  function scheduleForDate(date){
    return scheduleCache.find(item=>String(item?.date||'')===String(date||''))||null;
  }

  function installCanvasScheduleOverlay(){
    const original=window.createReportCanvas;
    if(typeof original!=='function'||original.__scheduleOverlayInstalled)return;

    const wrapped=function(info){
      const canvas=original(info);
      try{
        const event=scheduleForDate(info?.event?.date);
        if(!event)return canvas;

        const title=String(event.title||'').trim();
        const grade=gradeLabel(event);
        const time=String(event.time||'').trim();
        const place=String(event.place||'').trim();
        const memo=String(event.memo||'').trim();

        const line1=[
          title?'予定：'+title:'',
          grade?'対象：'+grade:'',
          time?'時間：'+time:''
        ].filter(Boolean).join('　｜　');

        const detailLabel=['official','friendly'].includes(String(event.category||''))?'対戦・詳細':'詳細';
        const line2=[
          place?'場所：'+place:'',
          memo?detailLabel+'：'+memo:''
        ].filter(Boolean).join('　｜　');

        if(!line1&&!line2)return canvas;

        const ctx=canvas.getContext('2d');
        const x=690,maxWidth=canvas.width-x-64;
        ctx.save();
        ctx.font='bold 20px "Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif';
        ctx.fillStyle='#7a5b18';
        if(line1)ctx.fillText(fitCanvasText(ctx,line1,maxWidth),x,151);
        ctx.font='19px "Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif';
        ctx.fillStyle='#596474';
        if(line2)ctx.fillText(fitCanvasText(ctx,line2,maxWidth),x,181);
        ctx.restore();
      }catch(_){}
      return canvas;
    };
    wrapped.__scheduleOverlayInstalled=true;
    window.createReportCanvas=wrapped;
  }

  // Prefetch only; failures never block attendance.
  loadSchedule().finally(installCanvasScheduleOverlay);

  function monthDayFromText(text){
    const match=String(text||'').match(/(\d{1,2})\/(\d{1,2})/);
    return match?{month:Number(match[1]),day:Number(match[2])}:null;
  }

  async function injectForReport(){
    const sheet=document.getElementById('reportSheet');
    const grades=document.getElementById('reportGrades');
    const title=document.getElementById('reportTitle');
    if(!sheet||!grades||!title)return;

    sheet.querySelector('.attendance-report-schedule-meta')?.remove();

    const md=monthDayFromText(title.textContent);
    if(!md)return;

    const schedule=await loadSchedule();
    const matches=schedule.filter(item=>{
      const parts=String(item?.date||'').split('-').map(Number);
      return parts.length===3&&parts[1]===md.month&&parts[2]===md.day;
    });
    if(!matches.length)return;

    matches.sort((a,b)=>Math.abs(Date.parse(String(a.date)+'T00:00:00')-Date.now())-Math.abs(Date.parse(String(b.date)+'T00:00:00')-Date.now()));
    const event=matches[0];
    const compact=compactScheduleHtml(event,true);
    if(!compact)return;

    installStyle();
    const section=document.createElement('section');
    section.className='attendance-report-schedule-meta';
    section.innerHTML=compact;
    grades.parentNode.insertBefore(section,grades);
  }

  document.addEventListener('click',event=>{
    const summaryButton=event.target?.closest?.('[data-summary-event]');
    if(summaryButton)setTimeout(()=>injectForButton(summaryButton),0);

    const reportButton=event.target?.closest?.('#openReportBtn');
    if(reportButton)setTimeout(injectForReport,0);
  });
})();
