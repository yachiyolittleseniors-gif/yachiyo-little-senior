(()=>{'use strict';
/*
 * Grade + escort filter for attendance exports.
 * This file is intentionally isolated from the attendance page load/render path.
 * If it fails, the core attendance table continues to work normally.
 */
function init(){
  const launch=document.querySelector('#reportLaunch .report-launch-grid');
  const openBtn=document.getElementById('openReportBtn');
  const eventSelect=document.getElementById('reportEventSelect');
  const dialog=document.getElementById('reportDialog');
  const saveBtn=document.getElementById('saveReportImageBtn');
  if(!launch||!openBtn||!eventSelect||!dialog||!saveBtn)return;
  if(document.getElementById('reportGradeSelect'))return;
  if(typeof reportSnapshot!=='function'||typeof renderReport!=='function'||typeof createReportCanvas!=='function')return;

  const isPlayer=/player-attendance/i.test(location.pathname)||document.title.includes('選手出欠');
  const originalOpen=openBtn.onclick;
  const originalSave=saveBtn.onclick;
  let activeFilteredInfo=null;

  const field=document.createElement('label');
  field.className='report-grade-addon-field';
  field.innerHTML='<span class="report-grade-addon-label">👥 対象学年</span><select id="reportGradeSelect" aria-label="出力する学年"><option value="">全学年</option><option value="1">1年＋帯同</option><option value="2">2年＋帯同</option><option value="3">3年＋帯同</option></select>';
  launch.insertBefore(field,openBtn);

  const style=document.createElement('style');
  style.id='report-grade-addon-style';
  style.textContent=
    '.report-launch-grid{grid-template-columns:minmax(180px,1.1fr) minmax(150px,.72fr) minmax(220px,1.12fr)!important}'+
    '.report-grade-addon-field{display:grid;gap:6px;padding:12px;border:2px solid #d8dde4;border-radius:13px;background:#fff;color:#536072!important;font-size:13px;font-weight:800}'+
    '.report-grade-addon-label{font-size:14px;font-weight:900}'+
    '.report-grade-addon-field select{width:100%;min-height:60px!important;padding:0 12px!important;border:2px solid #071426!important;border-radius:11px!important;background:#fff!important;color:#071426!important;font-size:17px!important;font-weight:900!important}'+
    '@media(max-width:680px){.report-launch-grid{grid-template-columns:1fr!important}}';
  document.head.appendChild(style);

  const gradeSelect=field.querySelector('select');

  function allMembersFromReport(info){
    const map=new Map();
    (info.grades||[]).forEach(group=>(group.groups||[]).forEach(item=>(item.members||[]).forEach(member=>map.set(String(member.id),member))));
    return [...map.values()];
  }

  function filteredSnapshot(eventId,grade){
    const base=reportSnapshot(eventId);
    if(!base)return null;
    const target=String(grade||'');
    if(!['1','2','3'].includes(target))return base;
    const escortMap=base.escortGradeByMember instanceof Map?base.escortGradeByMember:new Map();
    const members=allMembersFromReport(base).filter(member=>{
      const ownGrade=String(member.grades?.[0]||'');
      const escortGrade=String(escortMap.get(String(member.id))||'');
      // If this member is assigned to accompany an upper grade, treat that
      // assignment as their active group for this day's export.
      return escortGrade?escortGrade===target:ownGrade===target;
    });
    const ids=new Set(members.map(member=>String(member.id)));
    const statuses=['○','×',''];
    const groups=statuses.map(status=>({
      status,
      members:members.filter(member=>(data.answers?.[member.id]?.[base.event.id]||'')===status)
    }));
    const comments=(base.comments||[]).filter(comment=>ids.has(String(comment.memberId)));
    const totals=groups.map(group=>group.members.length);
    return {...base,grades:[{grade:target,groups}],comments,totals,__gradeFilter:target,__gradeLabel:target+'年生＋帯同'};
  }

  function statusClass(status){return status==='○'?'o':status==='×'?'x':'u'}
  function statusLabel(status){return status==='○'?'参加':status==='×'?'不参加':'未入力'}

  function renderFiltered(info){
    const grade=info.__gradeFilter;
    const label=info.__gradeLabel;
    const title=document.getElementById('reportTitle');
    const summary=document.getElementById('reportSummary');
    const grades=document.getElementById('reportGrades');
    const commentsTitle=document.getElementById('reportCommentsTitle');
    const comments=document.getElementById('reportComments');
    if(!title||!summary||!grades||!commentsTitle||!comments)return;

    title.textContent=formatDate(info.event.date)+' '+label+' '+(isPlayer?'選手':'保護者')+'出席一覧';
    summary.textContent=label+'　参加 '+info.totals[0]+'名　不参加 '+info.totals[1]+'名　未入力 '+info.totals[2]+'名';

    const group=info.grades[0];
    const cards=group.groups.map(item=>{
      const names=item.members.length?item.members.map(member=>{
        const escort=String(info.escortGradeByMember?.get(String(member.id))||'');
        const badge=escort===grade&&String(member.grades?.[0]||'')!==grade
          ?'<span class="report-member-accompany">（'+esc(grade)+'年帯同）</span>':'';
        return esc(member.name)+badge;
      }).join('、'):'該当者なし';
      const kind=statusClass(item.status);
      return '<section class="report-status report-status-'+kind+'"><h4>'+(item.status?item.status+' ':'')+statusLabel(item.status)+'（'+item.members.length+'名）</h4><p>'+names+'</p></section>';
    }).join('');

    const gradeClass=isPlayer?' class="grade-color-'+esc(grade)+'"':'';
    grades.innerHTML='<section class="report-grade"><h3><span'+gradeClass+'>'+esc(label)+'</span></h3><div class="report-status-grid">'+cards+'</div></section>';

    commentsTitle.textContent=formatDate(info.event.date)+' '+label+'のコメント一覧';
    comments.innerHTML=info.comments.length?info.comments.map(comment=>{
      const member=comment.member||{name:isPlayer?'選手':'回答者',grades:[]};
      const escort=String(info.escortGradeByMember?.get(String(member.id))||'');
      const badge=escort===grade&&String(member.grades?.[0]||'')!==grade
        ?'<span class="upper-grade-badge">'+esc(grade+'年生帯同')+'</span>':'';
      const gradeBadge=isPlayer?' grade-color-'+esc(member.grades?.[0]||''):'';
      return '<article class="report-comment"><span class="report-comment-grade'+gradeBadge+'">'+esc(member.grades?.[0]||'-')+'年</span><span class="report-comment-name">'+esc(member.name)+' '+badge+'</span><span class="report-comment-text">'+esc(comment.text||'')+'</span></article>';
    }).join(''):'<p class="report-empty">この日のコメントはありません。</p>';
  }

  async function openFiltered(){
    const eventId=eventSelect.value;
    const grade=gradeSelect.value;
    if(!grade){
      activeFilteredInfo=null;
      if(typeof originalOpen==='function')return originalOpen.call(openBtn);
      return;
    }
    const event=typeof visibleEvents==='function'?visibleEvents().find(item=>String(item.id)===String(eventId)):null;
    if(!event){alert('出力する日程を選択してください。');return}

    const originalText=openBtn.textContent;
    openBtn.disabled=true;
    try{
      if(isPlayer&&typeof loadParentEscortForReport==='function'){
        openBtn.textContent='帯同情報を照合中…';
        await loadParentEscortForReport(event.date);
      }
      if(!renderReport(eventId))throw new Error('一覧を作成できませんでした。');
      const info=filteredSnapshot(eventId,grade);
      if(!info)throw new Error('一覧を作成できませんでした。');
      activeFilteredInfo=info;
      renderFiltered(info);
      dialog.showModal();
      document.body.style.overflow='hidden';
    }catch(error){
      alert(error?.message||'一覧を作成できませんでした。');
    }finally{
      openBtn.disabled=false;
      openBtn.textContent=originalText;
    }
  }

  async function saveFiltered(){
    if(!activeFilteredInfo){
      if(typeof originalSave==='function')return originalSave.call(saveBtn);
      return;
    }
    const info=activeFilteredInfo;
    const originalText=saveBtn.textContent;
    saveBtn.disabled=true;
    saveBtn.textContent='画像を作成中…';
    try{
      const canvas=createReportCanvas(info);
      // Core canvas generation stays untouched. Add only a small target label
      // onto the finished image so the filtered export is unmistakable.
      try{
        const ctx=canvas.getContext('2d');
        ctx.save();
        ctx.textAlign='right';
        ctx.fillStyle='#9a6d12';
        ctx.font='bold 28px "Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif';
        ctx.fillText('対象：'+info.__gradeLabel,canvas.width-64,106);
        ctx.restore();
      }catch(_){}
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));
      if(!blob)throw new Error('画像を作成できませんでした。');
      const grade=info.__gradeFilter;
      const fileName=(isPlayer?'選手':'保護者')+'出席一覧_'+String(info.event.date).replaceAll('-','')+'_'+grade+'年_帯同.png';
      const file=new File([blob],fileName,{type:'image/png'});
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        try{
          await navigator.share({files:[file],title:formatDate(info.event.date)+' '+info.__gradeLabel+' '+(isPlayer?'選手':'保護者')+'出席一覧'});
          return;
        }catch(error){
          if(error?.name==='AbortError')return;
        }
      }
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
    }catch(error){
      alert(error?.message||'画像を保存できませんでした。');
    }finally{
      saveBtn.disabled=false;
      saveBtn.textContent=originalText;
    }
  }

  openBtn.onclick=openFiltered;
  saveBtn.onclick=saveFiltered;

  const closeBtn=document.getElementById('closeReportBtn');
  if(closeBtn)closeBtn.addEventListener('click',()=>{activeFilteredInfo=null});
  dialog.addEventListener('close',()=>{activeFilteredInfo=null});
}
try{init()}catch(error){console.error('attendance report grade addon',error)}
})();