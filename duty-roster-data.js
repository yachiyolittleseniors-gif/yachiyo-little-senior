// Shared duty roster data used by the board and car assignments.
(function(){
  const INITIAL_TABLES=[
    {year:2026,month:9,activityDays:[12,26],rows:[
      [5,'土','草野','古賀','本吉','山澤'],[6,'日','齋藤','篠崎','山本（要）','山本（諒）'],
      [12,'土','椙浦','高橋','赤羽','秋葉'],[13,'日','竹内','筒井','石川（晃）','井上（遙）'],
      [19,'土','永井','藤澤','井上（竜）','宇山'],[20,'日','本村','森田','江見','加賀原'],
      [21,'月','矢羽田','荒木','粕谷','亀井'],[22,'火','石川（圭）','石山','川村','小池'],
      [23,'水','大谷部','加藤','高祖','小堀'],[26,'土','古賀','齋藤','紺野','内藤'],
      [27,'日','篠崎','椙浦','中濱','長峰']
    ]},
    {year:2026,month:10,activityDays:[10,24],rows:[
      [3,'土','高橋','竹内','松井','松浦'],[4,'日','筒井','永井','溝上','村山'],
      [10,'土','藤澤','本村','本吉','山澤'],[11,'日','森田','矢羽田','山本（要）','山本（諒）'],
      [12,'月','荒木','石川（圭）','赤羽','秋葉'],[17,'土','石山','大谷部','石川（晃）','井上（遙）'],
      [18,'日','加藤','古賀','井上（竜）','宇山'],[24,'土','齋藤','篠崎','江見','加賀原'],
      [25,'日','椙浦','高橋','粕谷','亀井'],[31,'土','竹内','筒井','川村','小池']
    ]}
  ];
  const LEGACY_TABLES={'duty-mtwelqz2-e6tiec':INITIAL_TABLES[0],'duty-mtwelqz8-wzdvxy':INITIAL_TABLES[1]};
  function cleanName(value){return String(value||'').normalize('NFKC').replace(/[\s　]+/g,'').replace(/(?:さん|様)$/,'').replace(/[。、,，]+$/,'').trim().slice(0,60).replace(/^桓浦(?=$|\()/,'椙浦')}
  function nameKey(value){return cleanName(value).replace(/[()]/g,'')}
  function tableForImage(image){return image?.table||LEGACY_TABLES[image?.id]||null}
  function applyChanges(table,day,grade,name,changes){
    const date=table.year+'-'+String(table.month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    let value=name,changed=false,original='';
    (Array.isArray(changes)?changes:[]).forEach(item=>{
      if(item&&item.date===date&&String(item.grade)===String(grade)&&nameKey(value)===nameKey(item.from)&&cleanName(item.to)){
        original=original||value;value=item.to;changed=true;
      }
    });
    return{value,changed,original};
  }
  function namesForDate(data,date,grade){
    if(!data||data.initialized!==true||!date||!grade)return[];
    const names=[];
    (Array.isArray(data.images)?data.images:[]).forEach(image=>{
      if(!image||!(image.data||image.src))return;
      const table=tableForImage(image);
      if(!table||!Array.isArray(table.rows)||date.slice(0,7)!==table.year+'-'+String(table.month).padStart(2,'0'))return;
      const grades=table.grades||[2,1],group=grades.map(String).indexOf(String(grade));
      if(group<0)return;
      const row=table.rows.find(row=>Number(row[0])===Number(date.slice(8)));
      if(!row)return;
      row.slice(2+group*2,4+group*2).forEach(name=>{
        const result=applyChanges(table,row[0],grade,name,data.changes);
        if(cleanName(result.value))names.push(cleanName(result.value));
      });
    });
    return Array.from(new Map(names.map(name=>[nameKey(name),name])).values());
  }
  window.DutyRosterData={cleanName,nameKey,tableForImage,applyChanges,namesForDate};
})();

