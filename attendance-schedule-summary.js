(()=>{
  'use strict';

  const API='/.netlify/functions/site-data?section=schedule';
  let schedulePromise=null;

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function loadSchedule(){
    if(schedulePromise)return schedulePromise;
    schedulePromise=fetch(API,{cache:'no-store'})
      .then(response=>response.ok?response.json():Promise.reject(new Error('schedule')))
      .then(body=>Array.isArray(body?.data)?body.data:[])
      .catch(()=>[]);
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
      '.attendance-schedule-meta{border:1px solid rgba(199,154,59,.45)!important;background:#fffaf0!important}' +
      '.attendance-schedule-meta h3{color:#8b671d!important}' +
      '.attendance-schedule-meta-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:10px;padding:4px 0;font-size:12px;line-height:1.55}' +
      '.attendance-schedule-meta-row b{color:#6f7885;font-weight:800}' +
      '.attendance-schedule-meta-row span{color:#17202b;font-weight:800;overflow-wrap:anywhere}' +
      '.attendance-report-schedule-meta{margin:18px 0 20px;padding:15px 16px;border:1px solid rgba(199,154,59,.45);border-radius:14px;background:#fffaf0}' +
      '.attendance-report-schedule-meta h3{margin:0 0 9px;color:#8b671d;font-size:16px}' +
      '.attendance-report-schedule-meta .attendance-schedule-meta-row{font-size:13px;padding:5px 0}' +
      '@media(max-width:420px){.attendance-schedule-meta-row{grid-template-columns:74px minmax(0,1fr)}}';
    document.head.appendChild(style);
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

    const rows=detailRows(event);
    if(!rows.length)return;

    installStyle();
    const section=document.createElement('section');
    section.className='breakdown-grade attendance-schedule-meta';
    section.innerHTML='<h3>予定情報</h3>'+rows.map(([label,value])=>
      '<div class="attendance-schedule-meta-row"><b>'+esc(label)+'</b><span>'+esc(value)+'</span></div>'
    ).join('');
    body.prepend(section);
  }

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
    const rows=detailRows(event);
    if(!rows.length)return;

    installStyle();
    const section=document.createElement('section');
    section.className='attendance-report-schedule-meta';
    section.innerHTML='<h3>当日のスケジュール</h3>'+rows.map(([label,value])=>
      '<div class="attendance-schedule-meta-row"><b>'+esc(label)+'</b><span>'+esc(value)+'</span></div>'
    ).join('');
    grades.parentNode.insertBefore(section,grades);
  }

  document.addEventListener('click',event=>{
    const summaryButton=event.target?.closest?.('[data-summary-event]');
    if(summaryButton)setTimeout(()=>injectForButton(summaryButton),0);

    const reportButton=event.target?.closest?.('#openReportBtn');
    if(reportButton)setTimeout(injectForReport,0);
  });
})();
