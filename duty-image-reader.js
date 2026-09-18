(function(){
  let library;
  function loadOCR(){
    if(window.Tesseract)return Promise.resolve();
    if(!library)library=new Promise(function(resolve,reject){const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=resolve;script.onerror=function(){library=null;reject(new Error('読み取り機能を読み込めません。通信を確認してください。'))};document.head.appendChild(script)});
    return library;
  }
  window.readDutyImage=async function(source){
    const host=document.getElementById('dutyImageReview');host.hidden=false;host.replaceChildren();
    const image=document.createElement('img');image.src=source;image.alt='読み取り対象の原本';image.style.width='100%';host.append(image);
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent='画像を読み取っています…';host.append(status);
    let text='',worker;
    try{
      await loadOCR();worker=await Tesseract.createWorker('jpn',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn@1.0.0/4.0.0_best_int',logger:function(m){if(m.status==='recognizing text')status.textContent='読み取り中 '+Math.round(m.progress*100)+'%'}});
      await worker.setParameters({preserve_interword_spaces:'1'});
      text=(await worker.recognize(source)).data.text.normalize('NFKC');
      status.textContent='原本と照合し、日付・名前・黄色の日を確認してください。読み落とした行は追加できます。';
    }catch(e){status.textContent='自動読み取りに失敗しました。手入力で作成するか、キャンセルして再試行してください。'}finally{if(worker)await worker.terminate()}
    function field(label,type,value){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type=type;input.value=value;wrap.append(input);host.append(wrap);return input}
    const ym=text.match(/(20\d{2})\s*年/),mm=text.match(/(?:^|\s)(1[0-2]|[1-9])\s*月/);
    const year=field('年','number',ym?ym[1]:new Date().getFullYear());
    const month=field('月','number',mm?mm[1]:'');
    const activity=field('黄色の日（例：10,24）','text','');
    const grades=[...text.matchAll(/([123])\s*年/g)].map(m=>Number(m[1]));
    const left=field('左の学年','number',grades[0]||2),right=field('右の学年','number',grades[1]||1);
    const help=document.createElement('p');help.textContent='1行につき「日付,左学年の1人目,2人目,右学年の1人目,2人目」。空欄の担当者は「—」で入力してください。';host.append(help);
    const rows=document.createElement('textarea');rows.rows=12;rows.setAttribute('aria-label','読み取り結果の修正');
    rows.value=text.split('\n').map(line=>{const m=line.match(/^\s*(\d{1,2})\s*[日月火水木金土]\s+(.+)$/);if(!m)return '';return[m[1],...m[2].trim().split(/\s{2,}|\t/)].join(',')}).filter(Boolean).join('\n');host.append(rows);
    const raw=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='読み取った全文を見る';pre.textContent=text;raw.append(summary,pre);host.append(raw);
    const error=document.createElement('p');error.setAttribute('role','alert');host.append(error);
    const save=document.createElement('button'),cancel=document.createElement('button');save.type=cancel.type='button';save.textContent='確認して表を保存';cancel.textContent='キャンセル';host.append(save,cancel);
    return new Promise(resolve=>{
      cancel.onclick=function(){host.hidden=true;resolve(null)};
      save.onclick=function(){
        try{
          const y=Number(year.value),m=Number(month.value),g=[Number(left.value),Number(right.value)];
          if(!Number.isInteger(y)||y<2020||y>2100||!Number.isInteger(m)||m<1||m>12||g.some(v=>![1,2,3].includes(v))||g[0]===g[1])throw Error('年・月・左右の学年を確認してください。');
          const seen=new Set(),parsed=rows.value.trim().split(/\n/).map((line,i)=>{
            const parts=line.split(/[,，\t]/).map(v=>v.trim()),d=Number(parts.shift()),date=new Date(y,m-1,d);
            if(parts.length!==4||parts.some(v=>!v||v.length>60)||!Number.isInteger(d)||date.getMonth()!==m-1||date.getDate()!==d||seen.has(d))throw Error((i+1)+'行目の日付と4名の名前を確認してください。');
            seen.add(d);return[d,'日月火水木金土'[date.getDay()],...parts];
          });
          const days=activity.value.trim()?activity.value.split(/[,，、\s]+/).map(Number):[];
          if(days.some(d=>!seen.has(d)))throw Error('黄色の日は表にある日付を指定してください。');
          host.hidden=true;resolve({year:y,month:m,grades:g,activityDays:[...new Set(days)],rows:parsed.sort((a,b)=>a[0]-b[0])});
        }catch(e){error.textContent=e.message}
      };
    });
  };
})();
