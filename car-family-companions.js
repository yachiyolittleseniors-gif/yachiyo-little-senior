(()=>{
  const familySuffix=/^(?:.+?)(?:妹|姉|弟|兄|祖父|祖母)(?:[①-⑳]|[1-9])?$/;
  let familyNames=[];
  const byId=id=>document.getElementById(id);
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value||'').normalize('NFKC').trim().replace(/[\s　]+/g,'');

  const panel=document.createElement('div');
  panel.className='escort-father-panel';
  panel.innerHTML='<label for="familyCompanionInput">同行家族を手入力（苗字＋続柄）</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="familyCompanionInput" maxlength="80" placeholder="例：浅野妹、浅野祖母" style="flex:1;min-width:180px"><button class="escort-father-add" id="addFamilyCompanion" type="button">追加</button></div><div class="escort-father-list" id="familyCompanionList"></div><p class="escort-father-note">妹・姉・弟・兄・祖父・祖母を1人ずつ追加します。配車案では保護者・同行家族として人数と席数に含めます。</p>';
  byId('escortFatherPanel').after(panel);

  function draw(){
    byId('familyCompanionList').innerHTML=familyNames.map((name,index)=>`<span class="escort-father-chip">${escapeHtml(name)}<button type="button" data-family-index="${index}" aria-label="${escapeHtml(name)}を削除">×</button></span>`).join('');
  }
  function changed(){draw();updateCounts();renderCandidates();renderCars();renderPreview();saveDraft()}
  byId('addFamilyCompanion').onclick=()=>{
    showError('');
    if(!currentDate()||!selectedGrade){showError('先に日付と対象学年を選択してください。');return}
    const input=byId('familyCompanionInput');
    const names=input.value.split(/[、,\n]/).map(normalize).filter(Boolean);
    if(!names.length||names.some(name=>!familySuffix.test(name))){showError('「苗字＋妹／姉／弟／兄／祖父／祖母」の形で入力してください。');input.focus();return}
    const existing=new Set(parentData.members.map(member=>normalize(member.name)));
    if(names.some(name=>existing.has(name))){showError('出欠に登録済みの名前は追加できません。');return}
    familyNames=[...new Set([...familyNames,...names])];input.value='';changed();
  };
  byId('familyCompanionInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();byId('addFamilyCompanion').click()}});
  byId('familyCompanionList').onclick=event=>{
    const button=event.target.closest('[data-family-index]');if(!button)return;
    const removed=familyNames.splice(Number(button.dataset.familyIndex),1)[0];
    for(const car of cars){car.parents=(car.parents||[]).filter(name=>name!==removed);if(car.navigator===removed)car.navigator='';if(car.driver===removed)car.driver=''}
    changed();
  };

  const originalSnapshot=attendeeSnapshot;
  attendeeSnapshot=function(){
    const info=originalSnapshot();
    const known=new Set(info.parents.map(member=>String(member.name)));
    for(const name of familyNames){
      const current=info.parents.find(member=>String(member.name)===name);
      if(current){current.parent='family';continue}
      if(!known.has(name)){info.parents.push({id:`family_${name}`,name,parent:'family',grades:[]});known.add(name);info.total+=1}
    }
    return info;
  };
  const originalBreakdown=parentBreakdown;
  parentBreakdown=function(parents){
    const regular=parents.filter(member=>member.parent!=='family'&&!familyNames.includes(String(member.name)));
    return {...originalBreakdown(regular),family:parents.length-regular.length};
  };
  const originalCounts=updateCounts;
  updateCounts=function(){originalCounts();const counts=parentBreakdown(attendeeSnapshot().parents);byId('parentBreakdown').textContent=`父${counts.fathers}名・母${counts.mothers}名・同行家族${counts.family}名`};
  const originalPreview=renderPreview;
  renderPreview=function(){
    originalPreview();
    const counts=parentBreakdown(attendeeSnapshot().parents);
    const parentLabel=[...byId('previewSheet').querySelectorAll('.preview-count small')].find(node=>node.textContent==='保護者');
    if(parentLabel){parentLabel.textContent='保護者・同行家族';const breakdown=parentLabel.parentElement.querySelector('.preview-parent-breakdown');if(breakdown)breakdown.textContent=`父${counts.fathers}名・母${counts.mothers}名・同行家族${counts.family}名`}
  };
  const originalAssignment=currentAssignment;
  currentAssignment=function(){return {...originalAssignment(),familyCompanions:[...familyNames]}};
  const originalApply=applyAssignment;
  applyAssignment=function(value){familyNames=Array.isArray(value?.familyCompanions)?[...new Set(value.familyCompanions.map(normalize).filter(name=>familySuffix.test(name)))]:[];draw();return originalApply(value)};
  const originalReset=resetEntryFields;
  resetEntryFields=function(){familyNames=[];byId('familyCompanionInput').value='';draw();return originalReset()};
  draw();
})();
