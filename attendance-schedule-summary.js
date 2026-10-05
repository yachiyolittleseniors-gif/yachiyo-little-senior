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

  // Target-date picker: additive UI only. The native select remains the source of truth
  // so existing comment save / attendance logic is unchanged.
  function installDatePickerStyle(){
    if(document.getElementById('attendance-date-picker-style'))return;
    const style=document.createElement('style');
    style.id='attendance-date-picker-style';
    style.textContent=
      '.attendance-native-date-select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}' +
      '.attendance-date-picker-host{margin:6px 0 0}' +
      '.attendance-date-picker-trigger{width:100%;border:2px solid #b8c9e4;border-radius:14px;background:#fff;padding:10px 12px;text-align:left;color:#0b1a30;box-shadow:0 1px 0 rgba(7,20,38,.04);font:inherit;cursor:pointer}' +
      '.attendance-date-picker-trigger:focus{outline:3px solid rgba(56,132,255,.22);outline-offset:2px}' +
      '.attendance-date-picker-trigger-main{display:flex;align-items:center;gap:8px;min-width:0}' +
      '.attendance-date-picker-trigger-title{min-width:0;flex:1;font-size:15px;font-weight:900;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.attendance-date-picker-trigger-arrow{font-size:18px;line-height:1;color:#526173}' +
      '.attendance-date-picker-trigger-detail{display:block;margin:4px 0 0 44px;color:#748092;font-size:11px;font-weight:700;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.attendance-date-picker-badges{display:inline-flex;gap:4px;flex:0 0 auto}' +
      '.attendance-date-badge{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:27px;padding:0 8px;border:1px solid #cfd6df;border-radius:999px;background:#f5f7fa;color:#344255;font-size:12px;font-weight:900;line-height:1}' +
      '.attendance-date-badge.grade-1,.attendance-date-badge.grade-2,.attendance-date-badge.grade-3,.attendance-date-badge.grade-all,.attendance-date-badge.grade-other,.attendance-date-badge.grade-plain{background:#f5f7fa;color:#344255;border-color:#cfd6df}' +
      '.attendance-date-picker-overlay[hidden]{display:none!important}' +
      '.attendance-date-picker-overlay{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:flex-start;justify-content:center;padding:max(18px,env(safe-area-inset-top)) 12px max(18px,env(safe-area-inset-bottom));background:rgba(4,14,28,.56);backdrop-filter:blur(3px)}' +
      '.attendance-date-picker-panel{width:min(620px,100%);max-height:calc(100dvh - 36px);overflow:auto;background:#fff;border-radius:24px;box-shadow:0 24px 70px rgba(0,0,0,.28);overscroll-behavior:contain}' +
      '.attendance-date-picker-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:18px 18px 14px;background:rgba(255,255,255,.96);border-bottom:1px solid #e7eaf0;backdrop-filter:blur(8px)}' +
      '.attendance-date-picker-head h3{margin:0;flex:1;color:#0a1b35;font-size:20px;line-height:1.3}' +
      '.attendance-date-picker-pill{border:1px solid #cfd5df;border-radius:999px;background:#f5f7fa;padding:7px 12px;color:#24354d;font-size:12px;font-weight:900;white-space:nowrap}' +
      '.attendance-date-picker-close{border:0;background:#f1f3f6;width:34px;height:34px;border-radius:50%;font-size:22px;line-height:1;color:#26364d;cursor:pointer}' +
      '.attendance-date-picker-body{padding:12px 14px 16px}' +
      '.attendance-date-picker-group{margin:0 0 12px;border:1px solid #e0e5ec;border-radius:14px;overflow:hidden;background:#fff}' +
      '.attendance-date-picker-group-title{margin:0;padding:10px 12px;background:#eef4fb;border-left:4px solid #2769b3;color:#0d2a50;font-size:14px;font-weight:900;line-height:1.4}' +
      '.attendance-date-picker-group.all .attendance-date-picker-group-title{background:#fff8e6;border-left-color:#c79a24}' +
      '.attendance-date-picker-group.other .attendance-date-picker-group-title{background:#f4f5f7;border-left-color:#737b86}' +
      '.attendance-date-picker-row{display:flex;width:100%;align-items:center;gap:10px;border:0;border-top:1px solid #edf0f4;background:#fff;padding:11px 12px;text-align:left;color:#0b1a30;font:inherit;cursor:pointer}' +
      '.attendance-date-picker-group .attendance-date-picker-row:first-of-type{border-top:0}' +
      '.attendance-date-picker-row.selected{background:#fffdf5;box-shadow:inset 3px 0 #c79a24}' +
      '.attendance-date-picker-row-main{min-width:0;flex:1}' +
      '.attendance-date-picker-row-title{font-size:14px;font-weight:900;line-height:1.4;overflow-wrap:anywhere}' +
      '.attendance-date-picker-row-detail{margin-top:3px;color:#788394;font-size:11px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}' +
      '.attendance-date-picker-row-check{width:20px;flex:0 0 20px;text-align:center;color:#b9891d;font-size:17px;font-weight:900}' +
      '.attendance-date-picker-empty{padding:24px 10px;text-align:center;color:#7a8490;font-size:13px;font-weight:700}' +
      '.attendance-date-picker-footer{position:sticky;bottom:0;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid #e7eaf0;backdrop-filter:blur(8px)}' +
      '.attendance-date-picker-done{width:100%;border:0;border-radius:999px;background:#eef1f5;color:#0a1b35;padding:12px 16px;font-size:14px;font-weight:900;cursor:pointer}' +
      '@media(max-width:420px){.attendance-date-picker-panel{border-radius:20px}.attendance-date-picker-head{padding:15px 14px 12px}.attendance-date-picker-head h3{font-size:18px}.attendance-date-picker-body{padding:10px}.attendance-date-picker-row{padding:10px}.attendance-date-picker-trigger-title{font-size:14px}.attendance-date-picker-trigger-detail{margin-left:42px;font-size:10.5px}}';
    document.head.appendChild(style);
  }

  function pickerGradeInfo(event){
    const grades=Array.isArray(event?.grades)?event.grades.map(String):[];
    const school=['1','2','3'].filter(grade=>grades.includes(grade));
    const title=String(event?.title||'');
    const isExperience=title.includes('体験');
    const badges=[];
    if(isExperience||grades.includes('other')){
      badges.push({label:'他',kind:'other'});
    }else if(school.length===3){
      badges.push({label:'全',kind:'all'});
    }else{
      school.forEach(grade=>badges.push({label:grade+'年',kind:grade}));
    }
    if(!badges.length)badges.push({label:'日',kind:'plain'});
    return {grades,school,badges,isAll:!isExperience&&!grades.includes('other')&&school.length===3,isOtherOnly:isExperience||grades.includes('other')};
  }

  function pickerBadgeHtml(event){
    return pickerGradeInfo(event).badges.map(badge=>
      '<span class="attendance-date-badge grade-'+esc(badge.kind)+'">'+esc(badge.label)+'</span>'
    ).join('');
  }

  function pickerOpponent(event){
    const memo=String(event?.memo||'').trim();
    if(!memo)return'';
    let text=memo.replace(/^[\s　]*(?:対戦相手|対戦|相手)[：:]?[\s　]*/,'').trim();
    text=text.replace(/^[\s　]*vs[\s　]*/i,'').trim();
    const stop=text.search(/[｜|／/\n]|(?:　{2,})|(?:\s{2,})|(?:G[：:])|(?:グラウンド[：:])|(?:場所[：:])|(?:\【)|(?:\[)/);
    if(stop>0)text=text.slice(0,stop).trim();
    return text;
  }

  function pickerDetailText(event){
    if(!event)return'';
    const category=String(event.category||'');
    if(category!=='official'&&category!=='friendly')return'';
    const opponent=pickerOpponent(event);
    const place=String(event.place||'').trim();
    const parts=[];
    if(opponent)parts.push('vs '+opponent);
    if(place)parts.push(place);
    return parts.join(' ｜ ');
  }

  function pickerCurrentGrade(){
    try{
      if(typeof selectedMember==='undefined'||typeof data==='undefined')return'';
      const member=Array.isArray(data?.members)?data.members.find(item=>String(item?.id)===String(selectedMember)) : null;
      const grade=String(member?.grades?.[0]||member?.grade||'');
      return ['1','2','3'].includes(grade)?grade:'';
    }catch(_){return''}
  }

  function pickerPageKind(){
    const path=String(location.pathname||'');
    if(path.includes('coach-attendance'))return'coach';
    if(path.includes('player-attendance'))return'player';
    return'parent';
  }

  function pickerTitleFor(option,event){
    const date=String(option?.value||event?.date||'');
    const dateLabel=formatDate(date);
    const title=String(event?.title||'').trim();
    if(title)return(dateLabel?dateLabel+' ':'')+title;
    const raw=String(option?.textContent||'').trim();
    return raw||dateLabel||'日程';
  }

  function pickerOptions(select){
    const byDate=new Map(scheduleCache.map(item=>[String(item?.date||''),item]));
    return Array.from(select.options).map(option=>{
      const date=String(option.value||'');
      const event=byDate.get(date)||{date,title:String(option.textContent||'').replace(formatDate(date),'').trim(),grades:[]};
      return {date,event,title:pickerTitleFor(option,event),detail:pickerDetailText(event)};
    });
  }

  function pickerGroups(items){
    return items.length?[{key:'flat',title:'',items}]:[];
  }

  function installCommentDatePicker(){
    const select=document.getElementById('commentEventDate');
    const editor=document.getElementById('editor');
    if(!select||!editor||document.getElementById('attendanceDatePickerTrigger'))return;

    installDatePickerStyle();
    select.classList.add('attendance-native-date-select');

    const host=document.createElement('div');
    host.className='attendance-date-picker-host';
    const trigger=document.createElement('button');
    trigger.id='attendanceDatePickerTrigger';
    trigger.className='attendance-date-picker-trigger';
    trigger.type='button';
    trigger.setAttribute('aria-haspopup','dialog');
    host.appendChild(trigger);

    const label=select.closest('.comment-date-field')||select.parentElement;
    if(label?.parentNode)label.parentNode.insertBefore(host,label.nextSibling);
    else select.insertAdjacentElement('afterend',host);

    const overlay=document.createElement('div');
    overlay.className='attendance-date-picker-overlay';
    overlay.hidden=true;
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','対象日を選択');
    overlay.innerHTML=
      '<div class="attendance-date-picker-panel">' +
        '<div class="attendance-date-picker-head"><h3>対象日を選択</h3><span class="attendance-date-picker-pill">約1か月</span><button class="attendance-date-picker-close" type="button" aria-label="閉じる">×</button></div>' +
        '<div class="attendance-date-picker-body"></div>' +
        '<div class="attendance-date-picker-footer"><button class="attendance-date-picker-done" type="button">閉じる</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    const body=overlay.querySelector('.attendance-date-picker-body');
    let previousOverflow='';

    function modelForDate(date){
      return pickerOptions(select).find(item=>item.date===String(date||''))||null;
    }

    function syncTrigger(){
      const item=modelForDate(select.value);
      if(!item){
        trigger.innerHTML='<span class="attendance-date-picker-trigger-main"><span class="attendance-date-picker-trigger-title">対象日を選択</span><span class="attendance-date-picker-trigger-arrow">⌄</span></span>';
        return;
      }
      trigger.innerHTML=
        '<span class="attendance-date-picker-trigger-main"><span class="attendance-date-picker-badges">'+pickerBadgeHtml(item.event)+'</span><span class="attendance-date-picker-trigger-title">'+esc(item.title)+'</span><span class="attendance-date-picker-trigger-arrow">⌄</span></span>' +
        (item.detail?'<span class="attendance-date-picker-trigger-detail">'+esc(item.detail)+'</span>':'');
    }

    function renderOverlay(){
      const items=pickerOptions(select);
      const groups=pickerGroups(items,pickerCurrentGrade(),pickerPageKind());
      if(!groups.length){
        body.innerHTML='<div class="attendance-date-picker-empty">選択できる予定がありません。</div>';
        return;
      }
      body.innerHTML=
        '<section class="attendance-date-picker-group flat">' +
          groups[0].items.map(item=>
            '<button type="button" class="attendance-date-picker-row '+(item.date===select.value?'selected':'')+'" data-date="'+esc(item.date)+'">' +
              '<span class="attendance-date-picker-badges">'+pickerBadgeHtml(item.event)+'</span>' +
              '<span class="attendance-date-picker-row-main"><span class="attendance-date-picker-row-title">'+esc(item.title)+'</span>' +
              (item.detail?'<span class="attendance-date-picker-row-detail">'+esc(item.detail)+'</span>':'') +
              '</span><span class="attendance-date-picker-row-check">'+(item.date===select.value?'✓':'›')+'</span>' +
            '</button>'
          ).join('') +
        '</section>';
      body.querySelectorAll('[data-date]').forEach(button=>button.addEventListener('click',()=>{
        const date=button.getAttribute('data-date')||'';
        if(!date)return;
        select.value=date;
        select.dispatchEvent(new Event('change',{bubbles:true}));
        syncTrigger();
        closePicker();
      }));
    }

    function openPicker(){
      void loadSchedule().then(()=>{
        syncTrigger();
        renderOverlay();
        previousOverflow=document.body.style.overflow;
        document.body.style.overflow='hidden';
        overlay.hidden=false;
        overlay.querySelector('.attendance-date-picker-close')?.focus({preventScroll:true});
      });
    }

    function closePicker(){
      overlay.hidden=true;
      document.body.style.overflow=previousOverflow;
      trigger.focus({preventScroll:true});
    }

    trigger.addEventListener('click',openPicker);
    overlay.querySelector('.attendance-date-picker-close').addEventListener('click',closePicker);
    overlay.querySelector('.attendance-date-picker-done').addEventListener('click',closePicker);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closePicker()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)closePicker()});
    select.addEventListener('change',syncTrigger);

    const observer=new MutationObserver(()=>queueMicrotask(syncTrigger));
    observer.observe(select,{childList:true,subtree:true});
    observer.observe(editor,{attributes:true,attributeFilter:['class']});

    loadSchedule().finally(syncTrigger);
    setTimeout(syncTrigger,0);
  }


  function nativeGradeLabel(event){
    const info=pickerGradeInfo(event);
    return info.badges.map(badge=>badge.label).join('・');
  }

  function shortAttendancePlace(value,grade){
    let text=String(value||'').trim();
    if(!text)return'';

    // 八千代東邦グラウンド / 八千代東邦G は「東邦G」に短縮。
    text=text.replace(/八千代東邦(?:グラウンド|グランド|G)/g,'東邦G');

    // 学年別に複数グラウンドが入っている場合は学年表記を残す。
    // 例：東邦G（2年） 鹿島市シニアG（1年）
    text=text
      .replace(/\(([123]年)\)/g,'（$1）')
      .replace(/\s{2,}/g,' ')
      .trim();

    return text;
  }

  function nativeOpponent(event){
    const memo=String(event?.memo||'').trim();
    if(!memo)return'';

    let match=memo.match(/(?:対戦相手|対戦)[：:\s　]*([^\n｜|／/【\[]+)/);
    if(!match)match=memo.match(/(?:^|[\s　])vs[\s　]*([^\n｜|／/【\[]+)/i);

    if(match){
      return String(match[1]||'').replace(/^[\s　]+|[\s　]+$/g,'').replace(/^vs[\s　]*/i,'');
    }

    // 詳細欄が短いチーム名だけなら対戦相手として扱う。
    if(memo.length<=28&&!/[★☆【】\[\]@＠]/.test(memo)&&!/(持ち物|集合|運営|開会|閉会|回戦|時間|場所|グラウンド|球場)/.test(memo)){
      return memo.replace(/^vs[\s　]*/i,'').trim();
    }
    return'';
  }

  function nativeDetailText(event){
    if(!event)return'';
    const category=String(event.category||'');
    const memo=String(event.memo||'').trim();

    if(category==='official'||category==='friendly'){
      const opponent=nativeOpponent(event);
      const place=shortAttendancePlace(event.place,pickerCurrentGrade());
      const parts=[];
      if(opponent)parts.push('vs '+opponent);
      if(place)parts.push(place);
      return parts.join(' ｜ ');
    }

    if((category==='practice'||category==='other')&&memo){
      return '備考：'+memo;
    }
    return'';
  }

  function installInlineCommentDatePicker(){
    const select=document.getElementById('commentEventDate');
    const label=select?.closest?.('.comment-date-field')||select?.parentElement;
    if(!select||!label||document.getElementById('attendanceInlineDatePicker'))return;

    // 元のselectは値保持・保存処理用として残す。見た目だけカスタム表示にする。
    select.style.position='absolute';
    select.style.width='1px';
    select.style.height='1px';
    select.style.opacity='0';
    select.style.pointerEvents='none';
    select.style.overflow='hidden';

    const style=document.createElement('style');
    style.id='attendance-inline-date-picker-style';
    style.textContent=
      '.attendance-inline-date-picker{position:relative;width:100%;margin-top:2px}' +
      '.attendance-inline-date-button{width:100%;min-height:52px;border:2px solid #9fc3f3;border-radius:13px;background:#fff;padding:8px 42px 8px 12px;text-align:left;color:#071426;box-shadow:0 0 0 4px rgba(75,139,230,.10);font:inherit;cursor:pointer;position:relative}' +
      '.attendance-inline-date-button:after{content:"⌄";position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#526173;font-size:18px;font-weight:900}' +
      '.attendance-inline-date-title{display:block;font-size:16px;font-weight:900;line-height:1.35;overflow-wrap:anywhere}' +
      '.attendance-inline-date-detail{display:block;margin-top:4px;color:#7a8594;font-size:11px;font-weight:800;line-height:1.35;overflow-wrap:anywhere}' +
      '.attendance-inline-date-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:2147482000;max-height:420px;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;border:1px solid #cfd6df;border-radius:14px;background:#fff;box-shadow:0 14px 34px rgba(7,20,38,.18)}' +
      '.attendance-inline-date-menu[hidden]{display:none!important}' +
      '.attendance-inline-date-option{display:block;width:100%;border:0;border-bottom:1px solid #edf0f4;background:#fff;padding:11px 38px 11px 13px;text-align:left;color:#071426;font:inherit;cursor:pointer;position:relative}' +
      '.attendance-inline-date-option:last-child{border-bottom:0}' +
      '.attendance-inline-date-option.selected{background:#fffdf6}' +
      '.attendance-inline-date-option.selected:after{content:"✓";position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#b88717;font-size:18px;font-weight:900}' +
      '.attendance-inline-date-option-title{display:block;font-size:15px;font-weight:900;line-height:1.35;overflow-wrap:anywhere}' +
      '.attendance-inline-date-option-detail{display:block;margin-top:3px;color:#7a8594;font-size:11px;font-weight:800;line-height:1.35;overflow-wrap:anywhere}' +
      '@media(max-width:420px){.attendance-inline-date-title{font-size:15px}.attendance-inline-date-option-title{font-size:14px}}';
    document.head.appendChild(style);

    const wrap=document.createElement('div');
    wrap.id='attendanceInlineDatePicker';
    wrap.className='attendance-inline-date-picker';

    const button=document.createElement('button');
    button.type='button';
    button.className='attendance-inline-date-button';
    button.setAttribute('aria-haspopup','listbox');
    button.setAttribute('aria-expanded','false');

    const menu=document.createElement('div');
    menu.className='attendance-inline-date-menu';
    menu.hidden=true;
    menu.setAttribute('role','listbox');

    wrap.appendChild(button);
    wrap.appendChild(menu);
    label.appendChild(wrap);

    function itemForDate(date){
      return scheduleCache.find(item=>String(item?.date||'')===String(date||''))||null;
    }

    function titleFor(date,event){
      const grade=event?nativeGradeLabel(event):'';
      const title=String(event?.title||'').trim();
      return [formatDate(date),grade,title].filter(Boolean).join(' ');
    }

    function detailFor(event){
      return nativeDetailText(event);
    }

    function syncButton(){
      const date=String(select.value||'');
      const event=itemForDate(date);
      const fallback=Array.from(select.options).find(option=>String(option.value||'')===date)?.textContent?.trim()||'対象日を選択';
      const title=event?titleFor(date,event):fallback;
      const detail=event?detailFor(event):'';
      button.innerHTML=
        '<span class="attendance-inline-date-title">'+esc(title)+'</span>' +
        (detail?'<span class="attendance-inline-date-detail">'+esc(detail)+'</span>':'');
    }

    function renderMenu(){
      const byDate=new Map(scheduleCache.map(item=>[String(item?.date||''),item]));
      const current=String(select.value||'');
      const options=Array.from(select.options).filter(option=>String(option.value||'')!==current);

      if(!options.length){
        menu.innerHTML='<div style="padding:14px;text-align:center;color:#7a8594;font-size:12px;font-weight:700">ほかの日程はありません。</div>';
        return;
      }

      menu.innerHTML=options.map(option=>{
        const date=String(option.value||'');
        const event=byDate.get(date)||null;
        const title=event?titleFor(date,event):String(option.textContent||'').trim();
        const detail=event?detailFor(event):'';
        return '<button type="button" class="attendance-inline-date-option" data-date="'+esc(date)+'" role="option" aria-selected="false">' +
          '<span class="attendance-inline-date-option-title">'+esc(title)+'</span>' +
          (detail?'<span class="attendance-inline-date-option-detail">'+esc(detail)+'</span>':'') +
        '</button>';
      }).join('');

      menu.querySelectorAll('[data-date]').forEach(optionButton=>{
        optionButton.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          const date=optionButton.getAttribute('data-date')||'';
          if(!date)return;
          select.value=date;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          syncButton();
          closeMenu();
        });
      });
    }

    function positionMenu(){
      const rect=button.getBoundingClientRect();
      const gap=6,edge=12;
      const below=Math.max(0,window.innerHeight-rect.bottom-gap-edge);
      const above=Math.max(0,rect.top-gap-edge);
      const openAbove=below<260&&above>below;
      const available=Math.max(170,Math.min(420,openAbove?above:below));

      menu.style.maxHeight=available+'px';
      if(openAbove){
        menu.style.top='auto';
        menu.style.bottom='calc(100% + 6px)';
      }else{
        menu.style.top='calc(100% + 6px)';
        menu.style.bottom='auto';
      }
    }

    function openMenu(){
      void loadSchedule().then(()=>{
        renderMenu();
        positionMenu();
        menu.hidden=false;
        button.setAttribute('aria-expanded','true');
        menu.scrollTop=0;
      });
    }

    function closeMenu(){
      if(menu.hidden)return;
      menu.hidden=true;
      button.setAttribute('aria-expanded','false');
    }

    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      if(menu.hidden)openMenu(); else closeMenu();
    });

    menu.addEventListener('touchmove',event=>event.stopPropagation(),{passive:true});

    document.addEventListener('click',event=>{
      if(!wrap.contains(event.target))closeMenu();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeMenu();
    });
    select.addEventListener('change',syncButton);

    const observer=new MutationObserver(()=>queueMicrotask(()=>{
      syncButton();
      if(!menu.hidden)renderMenu();
    }));
    observer.observe(select,{childList:true,subtree:true});

    loadSchedule().finally(syncButton);
    setTimeout(syncButton,0);
  }


  function installSimpleNativeCommentDateSelect(){
    const select=document.getElementById('commentEventDate');
    if(!select)return;

    // iPhone標準のselectをそのまま使う。独自一覧は作らない。
    // 各optionの中に予定名＋対戦相手＋グラウンド（または備考）まで入れる。
    select.style.position='';
    select.style.width='';
    select.style.height='';
    select.style.opacity='';
    select.style.pointerEvents='';
    select.style.overflow='';

    // 以前の外出し詳細表示が残っていたら使わない。
    document.getElementById('attendanceSimpleDateDetail')?.remove();

    function apply(){
      const byDate=new Map(scheduleCache.map(item=>[String(item?.date||''),item]));

      Array.from(select.options).forEach(option=>{
        const date=String(option.value||'');
        const event=byDate.get(date);
        if(!event)return;

        const grade=nativeGradeLabel(event);
        const title=String(event.title||'').trim();
        const detail=nativeDetailText(event);

        const head=[formatDate(date),grade,title].filter(Boolean).join(' ');
        const label=detail ? head+'　｜　'+detail : head;

        if(option.textContent!==label)option.textContent=label;
      });
    }

    select.addEventListener('change',apply);
    const observer=new MutationObserver(()=>queueMicrotask(apply));
    observer.observe(select,{childList:true,subtree:true});

    loadSchedule().finally(apply);
    setTimeout(apply,0);
  }


  function cardDetailParts(event){
    if(!event)return{opponent:'',place:'',note:''};
    const category=String(event.category||'');
    const memo=String(event.memo||'').trim();

    if(category==='official'||category==='friendly'){
      const opponent=nativeOpponent(event);
      const place=shortAttendancePlace(event.place,pickerCurrentGrade());
      return{
        opponent:opponent?'vs '+opponent:'',
        place,
        note:''
      };
    }

    return{
      opponent:'',
      place:'',
      note:(category==='practice'||category==='other')&&memo?'備考：'+memo:''
    };
  }

  function installSimpleCardDatePicker(){
    const select=document.getElementById('commentEventDate');
    const label=select?.closest?.('.comment-date-field')||select?.parentElement;
    if(!select||!label||document.getElementById('attendanceCardDatePicker'))return;

    // 保存処理は既存selectをそのまま使用。見た目だけカードUIにする。
    select.style.position='absolute';
    select.style.width='1px';
    select.style.height='1px';
    select.style.opacity='0';
    select.style.pointerEvents='none';
    select.style.overflow='hidden';

    const style=document.createElement('style');
    style.id='attendance-card-date-picker-style';
    style.textContent=
      '.attendance-card-date-picker{width:100%;margin-top:2px}' +
      '.attendance-card-date-current{position:relative;width:100%;min-height:58px;border:2px solid #9fc3f3;border-radius:14px;background:#fff;padding:10px 44px 10px 13px;text-align:left;color:#071426;box-shadow:0 0 0 4px rgba(75,139,230,.10);font:inherit;cursor:pointer}' +
      '.attendance-card-date-current:after{content:"⌄";position:absolute;right:15px;top:50%;transform:translateY(-50%);color:#536174;font-size:19px;font-weight:900}' +
      '.attendance-card-date-head{display:block;font-size:16px;font-weight:900;line-height:1.35;overflow-wrap:anywhere}' +
      '.attendance-card-date-sub{display:block;margin-top:3px;color:#7b8695;font-size:11px;font-weight:800;line-height:1.35;overflow-wrap:anywhere}' +
      '.attendance-card-date-dialog{width:min(720px,calc(100% - 12px));max-width:none;height:auto;max-height:calc(100dvh - 20px);margin:auto;padding:0;border:0;border-radius:22px;background:#fff;color:#071426;box-shadow:0 24px 70px rgba(0,0,0,.30);overflow:hidden}' +
      '.attendance-card-date-dialog::backdrop{background:rgba(3,12,24,.52);backdrop-filter:blur(2px)}' +
      '.attendance-card-date-shell{display:flex;flex-direction:column;max-height:calc(100dvh - 20px)}' +
      '.attendance-card-date-top{display:flex;align-items:center;gap:12px;padding:16px 17px 13px;border-bottom:1px solid #e6e9ee;background:#fff;flex:0 0 auto}' +
      '.attendance-card-date-top h3{margin:0;flex:1;font-size:20px;line-height:1.3;color:#071426}' +
      '.attendance-card-date-close{width:38px;height:38px;border:0;border-radius:50%;background:#f0f2f5;color:#26364d;font-size:22px;font-weight:800;cursor:pointer}' +
      '.attendance-card-date-list{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px 10px 14px}' +
      '.attendance-card-date-item{display:block;width:100%;margin:0 0 8px;padding:13px 14px;border:1px solid #d8dde5;border-radius:14px;background:#fff;text-align:left;color:#071426;font:inherit;cursor:pointer}' +
      '.attendance-card-date-item:last-child{margin-bottom:0}' +
      '.attendance-card-date-item.selected{border:2px solid #c79a3b;background:#fffdf7;padding:12px 13px}' +
      '.attendance-card-date-item-head{display:flex;align-items:flex-start;gap:8px}' +
      '.attendance-card-date-item-title{min-width:0;flex:1;font-size:16px;font-weight:900;line-height:1.38;overflow-wrap:anywhere}' +
      '.attendance-card-date-check{flex:0 0 auto;color:#b78616;font-size:20px;font-weight:900;line-height:1.25}' +
      '.attendance-card-date-info{margin-top:5px;color:#7b8695;font-size:11px;font-weight:800;line-height:1.4;overflow-wrap:anywhere}' +
      '.attendance-card-date-info+.attendance-card-date-info{margin-top:2px}' +
      '@media(max-width:420px){.attendance-card-date-dialog{width:calc(100% - 8px);border-radius:18px}.attendance-card-date-top{padding:14px 13px 11px}.attendance-card-date-top h3{font-size:18px}.attendance-card-date-list{padding:8px}.attendance-card-date-item{padding:12px}.attendance-card-date-item.selected{padding:11px}.attendance-card-date-item-title{font-size:15px}.attendance-card-date-current{padding-left:11px}.attendance-card-date-head{font-size:15px}}';
    document.head.appendChild(style);

    const wrap=document.createElement('div');
    wrap.id='attendanceCardDatePicker';
    wrap.className='attendance-card-date-picker';

    const current=document.createElement('button');
    current.type='button';
    current.className='attendance-card-date-current';
    current.setAttribute('aria-haspopup','dialog');

    wrap.appendChild(current);
    label.appendChild(wrap);

    const dialog=document.createElement('dialog');
    dialog.className='attendance-card-date-dialog';
    dialog.setAttribute('aria-label','対象日を選択');
    dialog.innerHTML=
      '<div class="attendance-card-date-shell">' +
        '<div class="attendance-card-date-top"><h3>対象日を選択</h3><button type="button" class="attendance-card-date-close" aria-label="閉じる">×</button></div>' +
        '<div class="attendance-card-date-list"></div>' +
      '</div>';
    document.body.appendChild(dialog);

    const list=dialog.querySelector('.attendance-card-date-list');
    const closeButton=dialog.querySelector('.attendance-card-date-close');

    function eventForDate(date){
      return scheduleCache.find(item=>String(item?.date||'')===String(date||''))||null;
    }

    function headText(date,event,optionText){
      if(!event)return String(optionText||'').trim()||formatDate(date);
      const grade=nativeGradeLabel(event);
      const title=String(event.title||'').trim();
      return [formatDate(date),grade,title].filter(Boolean).join(' ');
    }

    function currentHtml(){
      const date=String(select.value||'');
      const option=Array.from(select.options).find(item=>String(item.value||'')===date);
      const event=eventForDate(date);
      const parts=cardDetailParts(event);
      const head=headText(date,event,option?.textContent||'');
      current.innerHTML=
        '<span class="attendance-card-date-head">'+esc(head||'対象日を選択')+'</span>' +
        (parts.opponent?'<span class="attendance-card-date-sub">'+esc(parts.opponent)+'</span>':'') +
        (parts.place?'<span class="attendance-card-date-sub">'+esc(parts.place)+'</span>':'') +
        (parts.note?'<span class="attendance-card-date-sub">'+esc(parts.note)+'</span>':'');
    }

    function renderList(){
      const currentDate=String(select.value||'');
      list.innerHTML=Array.from(select.options).map(option=>{
        const date=String(option.value||'');
        const event=eventForDate(date);
        const parts=cardDetailParts(event);
        const selected=date===currentDate;
        const head=headText(date,event,option.textContent||'');
        return '<button type="button" class="attendance-card-date-item '+(selected?'selected':'')+'" data-date="'+esc(date)+'">' +
          '<span class="attendance-card-date-item-head"><span class="attendance-card-date-item-title">'+esc(head)+'</span>' +
          (selected?'<span class="attendance-card-date-check">✓</span>':'')+'</span>' +
          (parts.opponent?'<span class="attendance-card-date-info">'+esc(parts.opponent)+'</span>':'') +
          (parts.place?'<span class="attendance-card-date-info">'+esc(parts.place)+'</span>':'') +
          (parts.note?'<span class="attendance-card-date-info">'+esc(parts.note)+'</span>':'') +
        '</button>';
      }).join('');

      list.querySelectorAll('[data-date]').forEach(button=>{
        button.addEventListener('click',()=>{
          const date=button.getAttribute('data-date')||'';
          if(!date)return;
          select.value=date;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          currentHtml();
          dialog.close();
        });
      });
    }

    function openDialog(){
      void loadSchedule().then(()=>{
        renderList();
        if(typeof dialog.showModal==='function')dialog.showModal();
        else dialog.setAttribute('open','');
        requestAnimationFrame(()=>{
          const selected=list.querySelector('.selected');
          if(selected)selected.scrollIntoView({block:'nearest'});
        });
      });
    }

    current.addEventListener('click',openDialog);
    closeButton.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{
      if(event.target===dialog)dialog.close();
    });
    select.addEventListener('change',currentHtml);

    const observer=new MutationObserver(()=>queueMicrotask(currentHtml));
    observer.observe(select,{childList:true,subtree:true});

    loadSchedule().finally(currentHtml);
    setTimeout(currentHtml,0);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSimpleCardDatePicker,{once:true});
  else installSimpleCardDatePicker();

})();
