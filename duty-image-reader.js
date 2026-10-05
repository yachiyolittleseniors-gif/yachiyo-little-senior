(function(){
  'use strict';
  let library;
  function loadOCR(){
    if(window.Tesseract)return Promise.resolve();
    if(!library)library=new Promise(function(resolve,reject){
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.onload=resolve;
      script.onerror=function(){library=null;reject(new Error('読み取り機能を読み込めません。通信を確認してください。'))};
      document.head.appendChild(script);
    });
    return library;
  }
  window.readDutyImage=async function(source){
    const policy=window.DutyGradePolicy;
    if(!policy)throw new Error('当番表の確認機能を読み込めませんでした。ページを再読み込みしてください。');
    const host=document.getElementById('dutyImageReview');host.hidden=false;host.replaceChildren();
    const image=document.createElement('img');image.src=source;image.alt='読み取り対象の原本';image.style.width='100%';host.append(image);
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent='画像を読み取っています…';host.append(status);
    let text='',worker;
    try{
      await loadOCR();
      worker=await Tesseract.createWorker('jpn',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn@1.0.0/4.0.0_best_int',logger:function(m){if(m.status==='recognizing text')status.textContent='読み取り中 '+Math.round(m.progress*100)+'%'}});
      await worker.setParameters({preserve_interword_spaces:'1'});
      text=(await worker.recognize(source)).data.text.normalize('NFKC');
      status.textContent='原本と照合し、対象学年・日付・名前・黄色の日を確認してください。';
    }catch(e){status.textContent='自動読み取りに失敗しました。手入力で作成するか、キャンセルして再試行してください。'}
    finally{if(worker)await worker.terminate()}
    function field(label,type,value){
      const wrap=document.createElement('label');wrap.textContent=label;
      const input=document.createElement('input');input.type=type;input.value=value;wrap.append(input);host.append(wrap);return input;
    }
    const ym=text.match(/(20\d{2})\s*年/),mm=text.match(/(?:^|\s)(1[0-2]|[1-9])\s*月/);
    const year=field('年','number',ym?ym[1]:new Date().getFullYear());
    const month=field('月','number',mm?mm[1]:'');
    const activity=field('黄色の日（例：10,24）','text','');
    const detected=[...new Set([...text.matchAll(/(?:^|[^\d])([123])\s*年/g)].map(m=>Number(m[1])))];
    const initial=detected.length>=2?detected.slice(0,3):[2,1];
    const countLabel=document.createElement('label');countLabel.textContent='対象学年数';
    const count=document.createElement('select');count.setAttribute('aria-label','対象学年数');
    count.add(new Option('2学年分','2'));count.add(new Option('3学年分','3'));count.value=String(initial.length);
    countLabel.append(count);host.append(countLabel);
    const gradeFields=[0,1,2].map(index=>{
      const label=document.createElement('label');label.textContent=(index+1)+'列目の学年（原本の左から順に）';
      const select=document.createElement('select');select.setAttribute('aria-label',(index+1)+'列目の学年');
      [3,2,1].forEach(g=>select.add(new Option(g+'年生',String(g))));
      select.value=String(initial[index]||[3,2,1].find(g=>!initial.includes(g))||1);
      label.append(select);host.append(label);return{label,select};
    });
    const note=document.createElement('p');note.textContent='ここで確認した対象学年が、この月の「変更後」の候補に反映されます。登録日ではなく、当番表の対象月で切り替わります。';host.append(note);
    const help=document.createElement('p');host.append(help);
    function selectedGrades(){return gradeFields.slice(0,Number(count.value)).map(f=>Number(f.select.value));}
    function refresh(){
      gradeFields[2].label.hidden=count.value!=='3';
      help.textContent='1行につき「日付,'+selectedGrades().map(g=>g+'年1人目,'+g+'年2人目').join(',')+'」。空欄の担当者は「—」で入力してください。';
    }
    count.addEventListener('change',refresh);gradeFields.forEach(f=>f.select.addEventListener('change',refresh));refresh();
    const rows=document.createElement('textarea');rows.rows=12;rows.setAttribute('aria-label','読み取り結果の修正');
    rows.value=text.split('\n').map(line=>{const m=line.match(/^\s*(\d{1,2})\s*[日月火水木金土]\s+(.+)$/);return m?[m[1],...m[2].trim().split(/\s{2,}|\t/)].join(','):''}).filter(Boolean).join('\n');host.append(rows);
    const raw=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='読み取った全文を見る';pre.textContent=text;raw.append(summary,pre);host.append(raw);
    const error=document.createElement('p');error.setAttribute('role','alert');host.append(error);
    const save=document.createElement('button'),cancel=document.createElement('button');save.type=cancel.type='button';save.textContent='確認して表を保存';cancel.textContent='キャンセル';host.append(save,cancel);
    return new Promise(resolve=>{
      cancel.onclick=function(){host.hidden=true;resolve(null)};
      save.onclick=function(){
        try{
          const y=Number(year.value),m=Number(month.value),gs=selectedGrades();
          const parsed=policy.parseRows(rows.value,y,m,gs);
          const days=activity.value.trim()?activity.value.normalize('NFKC').split(/[,、\s]+/).map(Number):[];
          const table={year:y,month:m,grades:gs,activityDays:[...new Set(days)],rows:parsed};
          if(!policy.validTable(table))throw new Error('黄色の日は表にある日付を指定してください。');
          host.hidden=true;resolve(table);
        }catch(e){error.textContent=e.message}
      };
    });
  };
})();
