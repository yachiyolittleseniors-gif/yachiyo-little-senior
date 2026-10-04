import { getStore } from "@netlify/blobs";
import { verifyAccessPassword } from "./_access-password.mjs";
import { boardSessionIsValid } from "./_board-session.mjs";
import { verifyAdminPassword, adminAuthError } from "./admin-rate-limit.mjs";
import { getLineSession, lineIdentityHash, lineLoginStartUrl, lineChannelId, sealLineFlow, unsealLineFlow } from "./_line-login-auth.mjs";

const STORE_NAME="yachiyo-public-site";
const KEY="content/duty-change-requests.json";
const LEGACY_KEY="content/duty-roster.json";
const MAX_REQUESTS=300;
const APPROVAL_TTL_MS=24*60*60*1000;
const PENDING_RETENTION_MONTHS=3;
const PROCESSED_RETENTION_MONTHS=12;
const DUTY_APPROVAL_LIFF_ID="2011836404-Htm3MsCI";

// Keep server-side roster verification aligned with the browser's DutyRosterData.
// The two original September/October roster images may not have table metadata
// persisted in Blob storage, so the browser resolves them from these legacy IDs.
const LEGACY_DUTY_TABLES={
  "duty-mtwelqz2-e6tiec":{
    year:2026,month:9,grades:[2,1],activityDays:[12,26],rows:[
      [5,"土","草野","古賀","本吉","山澤"],[6,"日","齋藤","篠崎","山本（要）","山本（諒）"],
      [12,"土","椙浦","高橋","赤羽","秋葉"],[13,"日","竹内","筒井","石川（晃）","井上（遙）"],
      [19,"土","永井","藤澤","井上（竜）","宇山"],[20,"日","本村","森田","江見","加賀原"],
      [21,"月","矢羽田","荒木","粕谷","亀井"],[22,"火","石川（圭）","石山","川村","小池"],
      [23,"水","大谷部","加藤","高祖","小堀"],[26,"土","古賀","齋藤","紺野","内藤"],
      [27,"日","篠崎","椙浦","中濱","長峰"]
    ]
  },
  "duty-mtwelqz8-wzdvxy":{
    year:2026,month:10,grades:[2,1],activityDays:[10,24],rows:[
      [3,"土","高橋","竹内","松井","松浦"],[4,"日","筒井","永井","溝上","村山"],
      [10,"土","藤澤","本村","本吉","山澤"],[11,"日","森田","矢羽田","山本（要）","山本（諒）"],
      [12,"月","荒木","石川（圭）","赤羽","秋葉"],[17,"土","石山","大谷部","石川（晃）","井上（遙）"],
      [18,"日","加藤","古賀","井上（竜）","宇山"],[24,"土","齋藤","篠崎","江見","加賀原"],
      [25,"日","椙浦","高橋","粕谷","亀井"],[31,"土","竹内","筒井","川村","小池"]
    ]
  }
};

function rosterCanonicalName(value){
  return String(value||"").normalize("NFKC").replace(/[\s　]+/g,"").replace(/(?:さん|様)$/,"").replace(/[。、,，]+$/,"").trim().slice(0,60).replace(/^桓浦(?=$|\()/,"椙浦");
}
function rosterNameKey(value){return rosterCanonicalName(value).replace(/[（）()]/g,"")}
function rosterTableForImage(image){return image?.table||LEGACY_DUTY_TABLES[String(image?.id||"")]||null}

function json(body,status=200,headers={}){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store, max-age=0, must-revalidate",
      "netlify-cdn-cache-control":"no-store",
      "cdn-cache-control":"no-store",
      "x-content-type-options":"nosniff",
      ...headers
    }
  });
}
function cleanName(value){return String(value||"").trim().replace(/[　\s]+/g," ")}
function nameKey(value){return cleanName(value).replace(/[（）()]/g,"")}
function validGrade(value){return ["1","2","3"].includes(String(value||""))}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""))}
function clientLabel(request){
  const ua=String(request?.headers?.get("user-agent")||"");
  const os=/Android/i.test(ua)?"Android":(/iPhone|iPad|iPod/i.test(ua)?"iPhone/iPad":(/Windows/i.test(ua)?"Windows":(/Macintosh|Mac OS X/i.test(ua)?"Mac":"その他")));
  let browser="ブラウザ";
  if(/Line\//i.test(ua))browser="LINE";
  else if(/CriOS/i.test(ua))browser="Chrome";
  else if(/EdgiOS|Edg\//i.test(ua))browser="Edge";
  else if(/FxiOS|Firefox\//i.test(ua))browser="Firefox";
  else if(/Chrome\//i.test(ua))browser="Chrome";
  else if(/Safari\//i.test(ua))browser="Safari";
  return (os+" / "+browser).slice(0,80);
}
function normalizeStatus(value){return ["pending","approved","rejected","closed"].includes(String(value))?String(value):"pending"}
function requestMonthEnd(date){
  const m=/^(\d{4})-(\d{2})-\d{2}$/.exec(String(date||""));
  if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]);
  return new Date(Date.UTC(y,mo,0,23,59,59,999));
}
function addUtcMonths(date,months){
  return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,date.getUTCDate(),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds(),date.getUTCMilliseconds()));
}
function requestIsPastMonth(item,now=new Date()){
  const end=requestMonthEnd(item?.date);
  return !!(end&&now>end);
}
function requestShouldDelete(item,now=new Date()){
  const status=String(item?.status||"");
  // Never purge a live confirmation request. Pending is workflow state, not
  // historical archive data; it must survive until approved/rejected/closed.
  if(status==="pending")return false;
  const end=requestMonthEnd(item?.date);
  if(!end)return false;
  if(status==="closed"){
    return now>addUtcMonths(end,PENDING_RETENTION_MONTHS);
  }
  if(["approved","rejected"].includes(status)){
    return now>addUtcMonths(end,PROCESSED_RETENTION_MONTHS);
  }
  return false;
}
async function sha256(value){
  const bytes=new TextEncoder().encode(String(value||""));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function newApprovalToken(){
  return crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
}
function publicSiteOrigin(request){
  const configured=String(process.env.URL||process.env.DEPLOY_PRIME_URL||"").trim();
  try{
    if(configured)return new URL(configured).origin;
  }catch{}
  try{return new URL(request.url).origin}catch{}
  return "https://yachiyo-little-senior.netlify.app";
}
function approvalUrl(request,token){
  // Send the approval through LIFF so the recipient's LINE identity is
  // available without the fragile browser auto-login flow.
  return `https://liff.line.me/${DUTY_APPROVAL_LIFF_ID}/?t=${encodeURIComponent(token)}`;
}
async function verifyLiffIdentity(idToken){
  const token=String(idToken||"").trim();
  const clientId=lineChannelId();
  if(!token||!clientId)return null;
  try{
    const body=new URLSearchParams({id_token:token,client_id:clientId});
    const response=await fetch("https://api.line.me/oauth2/v2.1/verify",{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body
    });
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    if(!data||!data.sub||String(data.aud||"")!==String(clientId))return null;
    return{...data,sub:String(data.sub)};
  }catch{
    return null;
  }
}
async function verifyLiffAccessIdentity(accessToken){
  const token=String(accessToken||"").trim();
  const clientId=lineChannelId();
  if(!token||!clientId)return null;
  try{
    const verifyUrl=new URL("https://api.line.me/oauth2/v2.1/verify");
    verifyUrl.searchParams.set("access_token",token);
    const verified=await fetch(verifyUrl,{headers:{"cache-control":"no-store"}});
    if(!verified.ok)return null;
    const info=await verified.json().catch(()=>null);
    if(!info||String(info.client_id||"")!==String(clientId)||Number(info.expires_in)<=0)return null;

    const profileResponse=await fetch("https://api.line.me/v2/profile",{
      headers:{authorization:`Bearer ${token}`,"cache-control":"no-store"}
    });
    if(!profileResponse.ok)return null;
    const profile=await profileResponse.json().catch(()=>null);
    if(!profile||!profile.userId)return null;
    return{sub:String(profile.userId)};
  }catch{
    return null;
  }
}
function normalizeMonitorEvent(item,index=0){
  const at=String(item?.at||"");
  const stage=String(item?.stage||"").slice(0,40);
  if(!at||!stage)return null;
  return{
    id:String(item?.id||`event-${index}`).slice(0,100),
    at:at.slice(0,60),
    stage,
    level:["info","warning","error","ok"].includes(String(item?.level))?String(item.level):"info",
    requestNo:String(item?.requestNo||"").slice(0,20),
    flowKey:String(item?.flowKey||"").slice(0,180),
    device:String(item?.device||"").slice(0,80),
    message:String(item?.message||"").slice(0,180)
  };
}
function pushMonitorEvent(data,event){
  const list=Array.isArray(data.monitorEvents)?data.monitorEvents:[];
  list.push(normalizeMonitorEvent({id:`event-${crypto.randomUUID()}`,at:new Date().toISOString(),...event},list.length));
  data.monitorEvents=list.filter(Boolean).slice(-120);
}
function normalizeItem(item,index=0){
  const fromGrade=String(item?.fromGrade||item?.grade||"");
  const toGrade=String(item?.toGrade||item?.grade||fromGrade||"");
  const fromName=cleanName(item?.fromName||item?.from);
  const toName=cleanName(item?.toName||item?.to);
  if(!validDate(item?.date)||!validGrade(fromGrade)||!validGrade(toGrade)||!fromName||!toName)return null;
  return{
    id:String(item?.id||`request-${index}`).slice(0,100),
    requestNo:String(item?.requestNo||"").slice(0,20),
    date:String(item.date),
    fromGrade,
    fromName,
    toGrade,
    toName,
    requestType:String(item?.requestType||"replace")==="swap"?"swap":"replace",
    swapDate:String(item?.swapDate||"").slice(0,10),
    swapGrade:String(item?.swapGrade||"").slice(0,2),
    swapName:cleanName(item?.swapName||"").slice(0,60),
    status:normalizeStatus(item?.status),
    createdAt:String(item?.createdAt||"").slice(0,60),
    updatedAt:String(item?.updatedAt||"").slice(0,60),
    approvalTokenHash:String(item?.approvalTokenHash||"").slice(0,128),
    approvalTokenHashes:Array.from(new Set([
      ...(Array.isArray(item?.approvalTokenHashes)?item.approvalTokenHashes:[]),
      item?.approvalTokenHash||""
    ].map(value=>String(value||"").slice(0,128)).filter(Boolean))).slice(-6),
    approvalExpiresAt:String(item?.approvalExpiresAt||"").slice(0,60),
    partnerApprovedAt:String(item?.partnerApprovedAt||"").slice(0,60),
    requesterLineHash:String(item?.requesterLineHash||"").slice(0,128),
    approvalMode:String(item?.approvalMode||"")==="admin"?"admin":((item?.requesterLineHash||item?.approvalTokenHash||(Array.isArray(item?.approvalTokenHashes)&&item.approvalTokenHashes.length)||item?.approvalExpiresAt)?"family":"admin"),
    requesterDevice:String(item?.requesterDevice||"").slice(0,80),
    requesterDeviceHash:String(item?.requesterDeviceHash||"").slice(0,128),
    approverDevice:String(item?.approverDevice||"").slice(0,80)
  };
}
function dedupePending(items){
  const out=[],pending=new Map();
  for(const item of items){
    if(item.status!=="pending"){out.push(item);continue;}
    const key=[item.requestType||"replace",item.date,item.fromGrade,item.fromName,item.swapDate||""].join("|");
    if(!pending.has(key)){pending.set(key,out.length);out.push(item);continue;}
    const idx=pending.get(key),current=out[idx];
    const a=Date.parse(current.updatedAt||current.createdAt||"")||0;
    const b=Date.parse(item.updatedAt||item.createdAt||"")||0;
    if(b>=a)out[idx]=item;
  }
  return out;
}
function requestPrefixFromIndex(index){
  let n=Math.max(0,Number(index)||0)+1;
  let out="";
  while(n>0){
    n-=1;
    out=String.fromCharCode(65+(n%26))+out;
    n=Math.floor(n/26);
  }
  return out;
}
function requestNoForSeq(seq){
  const n=Math.max(1,Math.floor(Number(seq)||1));
  const block=Math.floor((n-1)/999);
  const within=((n-1)%999)+1;
  return requestPrefixFromIndex(block)+String(within).padStart(3,"0");
}
function nextRequestNo(data){
  let seq=Math.max(0,Number(data?.requestSeq)||0);
  const used=new Set((data?.requests||[]).map(item=>String(item?.requestNo||"").toUpperCase()));
  let value="";
  do{seq+=1;value=requestNoForSeq(seq);}while(used.has(value));
  return{seq,value};
}
async function loadData(store){
  let data;
  const existing=await store.get(KEY,{type:"json",consistency:"strong"});
  if(existing?.version===1&&Array.isArray(existing.requests)){
    data={version:1,requestSeq:Math.max(0,Number(existing.requestSeq)||0),partnerApprovalEnabled:existing.partnerApprovalEnabled===true,requests:dedupePending(existing.requests.map(normalizeItem).filter(Boolean)),monitorEvents:(Array.isArray(existing.monitorEvents)?existing.monitorEvents:[]).map(normalizeMonitorEvent).filter(Boolean).slice(-120)};
  }else{
    // One-time safe migration from the old combined duty-roster document.
    const legacy=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"});
    const legacyRequests=Array.isArray(legacy?.requests)?legacy.requests:[];
    const migrated=dedupePending(legacyRequests.map(normalizeItem).filter(Boolean));
    let seq=Math.max(0,Number(legacy?.requestSeq)||0);
    for(const item of migrated){
      const m=/^A(\d+)$/.exec(String(item.requestNo||"").toUpperCase());
      if(m)seq=Math.max(seq,Number(m[1])||0);
    }
    data={version:1,requestSeq:seq,partnerApprovalEnabled:false,requests:migrated,monitorEvents:[],migratedAt:new Date().toISOString()};
    await store.setJSON(KEY,data);
  }

  // "反映済み" は当番表側に実際の変更履歴が存在する時だけ成立する。
  const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"})||{};
  const changes=Array.isArray(roster.changes)?roster.changes:[];
  const requestChanges=item=>changes.filter(change=>
    (
      (item.requestNo&&String(change?.requestNo||"")===item.requestNo) ||
      (
        String(change?.date||"")===item.date &&
        String(change?.grade||"")===item.fromGrade &&
        cleanName(change?.from)===item.fromName
      )
    )
  );
  const activeRequestChanges=item=>requestChanges(item).filter(change=>String(change?.status||"active")!=="cancelled");
  let reconciled=false;
  data.requests=data.requests.map(item=>{
    // 過去の不具合で「取消済み変更」が確認待ちへ戻ってしまった既存申請も、
    // 読み込み時に終了扱いへ補正する。
    if(item.status==="pending"){
      // Never close a live request because an older change happens to have the
      // same date/grade/name. Only a cancelled change carrying this exact
      // request number may close it.
      const exactChanges=changes.filter(change=>item.requestNo&&String(change?.requestNo||"")===item.requestNo);
      const exactCancelled=exactChanges.some(change=>String(change?.status||"active")==="cancelled");
      const exactActive=exactChanges.some(change=>String(change?.status||"active")!=="cancelled");
      if(exactCancelled&&!exactActive){
        reconciled=true;
        return{...item,status:"closed",updatedAt:new Date().toISOString(),approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:""};
      }
      return item;
    }
    if(item.status!=="approved")return item;
    const matched=activeRequestChanges(item);
    const reflected=item.requestType==="swap"
      ? matched.some(change=>String(change?.date||"")===item.date&&cleanName(change?.from)===item.fromName) &&
        matched.some(change=>String(change?.date||"")===item.swapDate&&cleanName(change?.from)===item.swapName)
      : matched.length>0;
    if(reflected)return item;

    // 管理画面で反映済み変更を取消した場合は「確認待ち」へ戻さず、
    // 申請自体も終了扱いにする。これにより取消済み申請がLINE再送可能な状態で復活しない。
    const cancelled=requestChanges(item).some(change=>String(change?.status||"active")==="cancelled");
    reconciled=true;
    if(cancelled){
      return{...item,status:"closed",updatedAt:new Date().toISOString(),approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:""};
    }
    // 取消ではなく反映データだけが欠けた場合は、監視対象として確認待ちへ戻す。
    return{...item,status:"pending",updatedAt:new Date().toISOString()};
  });
  const now=new Date();
  const beforeCleanup=data.requests.length;
  data.requests=data.requests.filter(item=>!requestShouldDelete(item,now));
  data.requests=dedupePending(data.requests);
  if(reconciled||data.requests.length!==beforeCleanup)await store.setJSON(KEY,data);
  return data;
}
async function boardAccess(store,request,context){
  if(await boardSessionIsValid(request))return true;
  const password=request.headers.get("x-access-password")||"";
  return verifyAccessPassword({role:"board",store,request,context,password});
}
async function adminAccess(store,request,context){
  return verifyAdminPassword({store,request,context,expectedPassword:process.env.ADMIN_PASSWORD||""});
}
function publicRequest(item,requesterHash="",requesterDeviceHash=""){
  const mode=item.approvalMode||"admin";
  const familyCanCancel=mode==="family"&&!!requesterHash&&!!item.requesterLineHash&&requesterHash===item.requesterLineHash;
  const adminCanCancel=mode==="admin"&&!!requesterDeviceHash&&!!item.requesterDeviceHash&&requesterDeviceHash===item.requesterDeviceHash;
  return{
    id:item.id,requestNo:item.requestNo,date:item.date,
    fromGrade:item.fromGrade,fromName:item.fromName,toGrade:item.toGrade,toName:item.toName,
    requestType:item.requestType||"replace",swapDate:item.swapDate||"",swapGrade:item.swapGrade||"",swapName:item.swapName||"",
    status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt,
    approvalExpiresAt:item.approvalExpiresAt||"",
    partnerApprovedAt:item.partnerApprovedAt||"",
    approvalMode:mode,
    requesterCanCancel:item.status==="pending"&&(familyCanCancel||adminCanCancel)
  };
}
function publicData(data,requesterHash="",requesterDeviceHash=""){
  // Pending requests must remain visible until they are approved/rejected/closed.
  // Hiding them merely because their duty date is in an earlier month makes a
  // newly submitted test/late request disappear immediately from "確認待ち".
  const visibleRequests=data.requests.filter(item=>item.status!=="closed");
  return{
    requests:visibleRequests.map(item=>publicRequest(item,requesterHash,requesterDeviceHash)),
    pendingCount:visibleRequests.filter(item=>item.status==="pending").length,
    partnerApprovalEnabled:data.partnerApprovalEnabled===true
  };
}
function monitorSnapshot(data,roster){
  const now=Date.now();
  const changes=Array.isArray(roster?.changes)?roster.changes:[];
  const visible=data.requests.filter(item=>item.status!=="closed");
  const expired=visible.filter(item=>item.status==="pending"&&Number.isFinite(Date.parse(item.approvalExpiresAt||""))&&Date.parse(item.approvalExpiresAt)<now);
  const missingLine=visible.filter(item=>data.partnerApprovalEnabled===true&&item.status==="pending"&&(item.approvalMode||"admin")==="family"&&!item.requesterLineHash);
  const approvedMissingChange=visible.filter(item=>{
    if(item.status!=="approved")return false;
    const matched=changes.filter(change=>
      String(change?.status||"active")!=="cancelled" &&
      ((item.requestNo&&String(change?.requestNo||"")===item.requestNo) ||
       (String(change?.date||"")===item.date&&String(change?.grade||"")===item.fromGrade&&cleanName(change?.from)===item.fromName))
    );
    if(item.requestType==="swap"){
      return !(matched.some(change=>String(change?.date||"")===item.date&&cleanName(change?.from)===item.fromName) &&
        matched.some(change=>String(change?.date||"")===item.swapDate&&cleanName(change?.from)===item.swapName));
    }
    return !matched.length;
  });
  const events=Array.isArray(data.monitorEvents)?data.monitorEvents.slice():[];
  const latestByFlow=new Map();
  events.forEach(event=>{if(event.flowKey)latestByFlow.set(event.flowKey,event)});
  const stalledLine=[...latestByFlow.values()].filter(event=>event.stage==="line_start"&&(now-(Date.parse(event.at)||now))>10*60*1000);
  const issues=[
    ...expired.map(item=>({type:"expired",requestNo:item.requestNo,message:"承認リンクの有効期限が切れています。"})),
    ...missingLine.map(item=>({type:"line",requestNo:item.requestNo,message:"申請者のLINE識別情報がありません。"})),
    ...approvedMissingChange.map(item=>({type:"reflection",requestNo:item.requestNo,message:"承認済みですが当番表への反映を確認できません。"})),
    ...stalledLine.map(item=>({type:"line_stalled",requestNo:item.requestNo,message:"LINE認証開始後、申請完了まで到達していません。"}))
  ];
  const recent=visible.slice().sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))).slice(0,10).map(item=>({
    requestNo:item.requestNo,date:item.date,status:item.status,
    createdAt:item.createdAt,updatedAt:item.updatedAt,
    requesterDevice:item.requesterDevice||"",
    approverDevice:item.approverDevice||"",
    lineAuthenticated:!!item.requesterLineHash,
    approvalExpiresAt:item.approvalExpiresAt||""
  }));
  const recentEvents=events.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,12);
  return{
    partnerApprovalEnabled:data.partnerApprovalEnabled===true,
    status:issues.some(x=>x.type==="reflection"||x.type==="line"||x.type==="line_stalled")?"error":(issues.length?"warning":"ok"),
    pendingCount:visible.filter(item=>item.status==="pending").length,
    approvedCount:visible.filter(item=>item.status==="approved").length,
    issueCount:issues.length,
    issues,recent,recentEvents,
    checkedAt:new Date().toISOString()
  };
}
function requestMatchesRoster(roster,date,fromGrade,fromName){
  const selected=new Date(`${date}T00:00:00`);
  const images=Array.isArray(roster?.images)?roster.images:[];
  const changes=Array.isArray(roster?.changes)?roster.changes:[];
  return images.some(image=>{
    const table=rosterTableForImage(image);
    if(!table||!Array.isArray(table.rows))return false;
    if(Number(table.year)!==selected.getFullYear()||Number(table.month)!==selected.getMonth()+1)return false;
    const day=selected.getDate();
    const grades=Array.isArray(table.grades)&&table.grades.length?table.grades:[2,1];
    return table.rows.some(row=>{
      if(!Array.isArray(row)||Number(String(row[0]||"").replace(/\D/g,""))!==day)return false;
      return row.slice(2,6).some((name,index)=>{
        const grade=String(grades[Math.floor(index/2)]);
        if(grade!==String(fromGrade))return false;
        let current=rosterCanonicalName(name);
        changes.forEach(change=>{
          if(!change||String(change.status||"active")==="cancelled")return;
          if(String(change.date||"")!==date||String(change.grade||"")!==grade)return;
          if(rosterNameKey(current)!==rosterNameKey(change.from))return;
          const next=rosterCanonicalName(change.to);
          if(next)current=next;
        });
        return rosterNameKey(current)===rosterNameKey(fromName);
      });
    });
  });
}


function requestDateIsTestMode(roster,date){
  const match=/^(\d{4})-(\d{2})-\d{2}$/.exec(String(date||""));
  if(!match)return false;
  const year=Number(match[1]),month=Number(match[2]);
  const images=Array.isArray(roster?.images)?roster.images:[];
  return images.some(image=>
    image?.testMode===true &&
    Number(image?.table?.year)===year &&
    Number(image?.table?.month)===month
  );
}
async function lineIdentityForTest(request,roster,date,returnPath){
  if(!requestDateIsTestMode(roster,date))return{required:false,hash:""};
  const session=await getLineSession(request);
  if(!session){
    return{required:true,response:json({
      error:"LINE認証が必要です。",
      code:"line_login_required",
      loginUrl:lineLoginStartUrl(request,returnPath)
    },401)};
  }
  return{required:true,hash:await lineIdentityHash(session.sub)};
}

async function applyRequestToRoster(store,item){
  const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"})||{initialized:true,images:[],changes:[]};
  if(!requestMatchesRoster(roster,item.date,item.fromGrade,item.fromName)){
    return{ok:false,error:"対象月の当番表が登録されていないか、変更前の担当者が一致しません。"};
  }
  const isSwap=item.requestType==="swap";
  if(isSwap){
    if(!validDate(item.swapDate)||!validGrade(item.swapGrade)||!cleanName(item.swapName)){
      return{ok:false,error:"入れ替える相手のお当番日を確認できません。"};
    }
    if(item.swapDate===item.date&&item.swapGrade===item.fromGrade&&cleanName(item.swapName)===cleanName(item.fromName)){
      return{ok:false,error:"同じ当番枠同士は入れ替えできません。"};
    }
    if(!requestMatchesRoster(roster,item.swapDate,item.swapGrade,item.swapName)){
      return{ok:false,error:"入れ替える相手が選択した日のお当番表と一致しません。"};
    }
  }
  const changes=Array.isArray(roster.changes)?roster.changes.slice():[];
  const upsert=(date,fromGrade,fromName,toGrade,toName,suffix)=>{
    const idx=changes.findIndex(x=>String(x?.date||"")===date&&String(x?.grade||"")===fromGrade&&cleanName(x?.from)===fromName);
    const change={
      id:idx>=0?String(changes[idx].id||`change-${crypto.randomUUID()}`):`change-${crypto.randomUUID()}-${suffix}`,
      requestNo:item.requestNo,date,grade:fromGrade,from:fromName,to:toName,toGrade,
      status:"active",createdAt:new Date().toISOString()
    };
    if(idx>=0)changes[idx]=change;else changes.push(change);
  };
  upsert(item.date,item.fromGrade,item.fromName,item.toGrade,item.toName,"a");
  if(isSwap){
    upsert(item.swapDate,item.swapGrade,item.swapName,item.fromGrade,item.fromName,"b");
  }
  await store.setJSON(LEGACY_KEY,{...roster,changes});
  return{ok:true};
}

async function findRequestByApprovalToken(data,token){
  if(!token||String(token).length<40)return null;
  const hash=await sha256(token);
  return data.requests.find(item=>{
    if(item.status!=="pending")return false;
    const hashes=Array.from(new Set([
      ...(Array.isArray(item.approvalTokenHashes)?item.approvalTokenHashes:[]),
      item.approvalTokenHash||""
    ].filter(Boolean)));
    return hashes.includes(hash);
  })||null;
}
function appendApprovalHash(item,hash){
  return Array.from(new Set([
    ...(Array.isArray(item?.approvalTokenHashes)?item.approvalTokenHashes:[]),
    item?.approvalTokenHash||"",
    hash||""
  ].filter(Boolean))).slice(-6);
}

function approvalPreview(item){
  return{
    requestNo:item.requestNo,date:item.date,
    fromGrade:item.fromGrade,fromName:item.fromName,
    toGrade:item.toGrade,toName:item.toName,
    requestType:item.requestType||"replace",swapDate:item.swapDate||"",swapGrade:item.swapGrade||"",swapName:item.swapName||"",
    expiresAt:item.approvalExpiresAt
  };
}


export default async (request,context)=>{
  const store=getStore({name:STORE_NAME,consistency:"strong"});
  try{
    if(request.method==="GET"){
      const url=new URL(request.url);
      if(url.searchParams.get("action")==="preview-partner-approval"){
        const data=await loadData(store);
        if(data.partnerApprovalEnabled!==true)return json({error:"交代相手の承認リンクは現在使用されていません。"},404);
        const token=String(url.searchParams.get("t")||"");
        const item=await findRequestByApprovalToken(data,token);
        if(!item)return json({error:"承認リンクが無効です。\nまたは、すでに使用済みです。"},404);
        const expires=Date.parse(item.approvalExpiresAt||"");
        if(!Number.isFinite(expires)||Date.now()>expires)return json({error:"承認リンクの有効期限が切れています。申請者に再申請を依頼してください。"},410);
        return json({
          ok:true,
          request:approvalPreview(item),
          liffRequired:true
        });
      }
      if(!(await boardAccess(store,request,context)))return json({error:"unauthorized"},401);
      const data=await loadData(store);
      const session=await getLineSession(request);
      const requesterHash=session?await lineIdentityHash(session.sub):"";
      const requesterDeviceToken=String(request.headers.get("x-duty-requester-device")||"").trim();
      const requesterDeviceHash=requesterDeviceToken?await sha256(requesterDeviceToken):"";
      return json({ok:true,...publicData(data,requesterHash,requesterDeviceHash)});
    }
    if(request.method!=="POST")return json({error:"method not allowed"},405);

    let body;
    try{body=await request.json();}catch{return json({error:"invalid json"},400);}
    const action=String(body?.action||"");

    if(action==="submit-line-resume"){
      const resume=await unsealLineFlow(String(body?.token||""));
      if(!resume||resume.purpose!=="duty-submit"||!Number.isFinite(Number(resume.exp))||Date.now()>Number(resume.exp)){
        return json({error:"LINE認証の引き継ぎ情報が無効、または期限切れです。もう一度申請してください。"},400);
      }
      const date=String(resume.date||"");
      const fromGrade=String(resume.fromGrade||"");
      const toGrade=String(resume.toGrade||"");
      const fromName=cleanName(resume.fromName);
      const toName=cleanName(resume.toName);
      const requestType=String(resume.requestType||"replace")==="swap"?"swap":"replace";
      const swapDate=String(resume.swapDate||"");
      const swapGrade=String(resume.swapGrade||"");
      const swapName=cleanName(resume.swapName);
      const swapInvalid=requestType==="swap"&&(!validDate(swapDate)||!validGrade(swapGrade)||!swapName);
      if(!validDate(date)||!validGrade(fromGrade)||!validGrade(toGrade)||!fromName||!toName||(fromGrade===toGrade&&fromName===toName)||swapInvalid){
        return json({error:"申請内容を確認できませんでした。もう一度申請してください。"},400);
      }
      const resumeSession=await getLineSession(request);
      if(!resumeSession?.sub){
        return json({error:"LINE認証を確認できませんでした。元の画面からもう一度申請してください。",code:"line_session_required"},401);
      }
      const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"});
      if(!requestMatchesRoster(roster,date,fromGrade,fromName)){
        return json({error:"変更前の名前が現在の当番表と一致しません。当番表を確認してもう一度申請してください。"},400);
      }
      if(requestType==="swap"&&!requestMatchesRoster(roster,swapDate,swapGrade,swapName)){
        return json({error:"入れ替える相手のお当番日と担当者が一致しません。"},400);
      }
      const data=await loadData(store);
      if(data.partnerApprovalEnabled!==true){
        return json({error:"交代相手の承認リンクは現在使用されていません。"},409);
      }
      const requesterLineHash=await lineIdentityHash(String(resumeSession.sub));
      const now=new Date().toISOString();
      const idx=data.requests.findIndex(item=>item.status==="pending"&&(
        (resume.requestId&&item.id===String(resume.requestId))||
        (item.date===date&&item.fromGrade===fromGrade&&item.fromName===fromName&&String(item.requestType||"replace")===requestType&&String(item.swapDate||"")===swapDate)
      ));
      const issuedApprovalToken=newApprovalToken();
      const approvalTokenHash=await sha256(issuedApprovalToken);
      const approvalExpiresAt=new Date(Date.now()+APPROVAL_TTL_MS).toISOString();
      let item;
      if(idx>=0){
        item={...data.requests[idx],toGrade,toName,requestType,swapDate,swapGrade,swapName,approvalMode:"family",updatedAt:now,approvalTokenHash,approvalTokenHashes:appendApprovalHash(data.requests[idx],approvalTokenHash),approvalExpiresAt,partnerApprovedAt:"",requesterLineHash,requesterDevice:clientLabel(request)};
        data.requests[idx]=item;
      }else{
        if(data.requests.length>=MAX_REQUESTS)return json({error:"申請の保存上限に達しています。管理者へ連絡してください。"},400);
        const next=nextRequestNo(data);data.requestSeq=next.seq;
        item={
          id:`request-${crypto.randomUUID()}`,requestNo:next.value,date,
          fromGrade,fromName,toGrade,toName,requestType,swapDate,swapGrade,swapName,approvalMode:"family",status:"pending",createdAt:now,updatedAt:now,
          approvalTokenHash,approvalTokenHashes:approvalTokenHash?[approvalTokenHash]:[],approvalExpiresAt,partnerApprovedAt:"",requesterLineHash,requesterDevice:clientLabel(request),requesterDeviceHash:item?.requesterDeviceHash||"",approverDevice:""
        };
        data.requests.push(item);
      }
      data.requests=dedupePending(data.requests);
      pushMonitorEvent(data,{
        stage:"request_created",level:"ok",requestNo:item.requestNo,
        flowKey:[date,fromGrade,fromName].join("|"),
        device:clientLabel(request),
        message:"LINE認証完了・承認リンクを発行しました。"
      });
      await store.setJSON(KEY,data);
      return json({
        ok:true,
        request:publicRequest(item),
        approvalUrl:approvalUrl(request,issuedApprovalToken),
        approvalExpiresAt
      });
    }

    if(action==="preview-partner-approval"||action==="partner-approve"){
      const data=await loadData(store);
      if(data.partnerApprovalEnabled!==true)return json({error:"交代相手の承認リンクは現在使用されていません。"},404);
      const token=String(body?.token||"");
      const item=await findRequestByApprovalToken(data,token);
      if(!item)return json({error:"承認リンクが無効です。\nまたは、すでに使用済みです。"},404);
      const expires=Date.parse(item.approvalExpiresAt||"");
      if(!Number.isFinite(expires)||Date.now()>expires)return json({error:"承認リンクの有効期限が切れています。申請者に再申請を依頼してください。"},410);
      const identity=(await verifyLiffIdentity(body?.idToken))||(await verifyLiffAccessIdentity(body?.accessToken));
      if(!identity?.sub){
        return json({error:"LINE本人確認を確認できませんでした。LINEから承認リンクを開き直してください。",code:"liff_identity_required"},401);
      }
      const currentHash=await lineIdentityHash(identity.sub);
      const selfApprovalBlocked=!!item.requesterLineHash&&currentHash===item.requesterLineHash;
      if(action==="preview-partner-approval")return json({ok:true,request:approvalPreview(item),lineAuthRequired:false,selfApprovalBlocked});
      if(selfApprovalBlocked){
        pushMonitorEvent(data,{stage:"self_approval_blocked",level:"warning",requestNo:item.requestNo,device:clientLabel(request),message:"申請者本人による承認をブロックしました。"});
        await store.setJSON(KEY,data);
        return json({error:"申請したLINEアカウントでは承認できません。変更後のご家庭へ承認を依頼してください。",code:"self_approval_blocked"},403);
      }
      const applied=await applyRequestToRoster(store,item);
      if(!applied.ok){
        pushMonitorEvent(data,{stage:"reflection_error",level:"error",requestNo:item.requestNo,device:clientLabel(request),message:"承認後の当番表反映に失敗しました。"});
        await store.setJSON(KEY,data);
        return json({error:applied.error},409);
      }
      const idx=data.requests.findIndex(x=>x.id===item.id);
      const now=new Date().toISOString();
      data.requests[idx]={...item,status:"approved",partnerApprovedAt:now,updatedAt:now,approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:"",approverDevice:clientLabel(request)};
      pushMonitorEvent(data,{stage:"approved_reflected",level:"ok",requestNo:item.requestNo,device:clientLabel(request),message:"交代相手の承認・当番表反映が完了しました。"});
      await store.setJSON(KEY,data);
      return json({ok:true,message:"承認しました。\n当番表へ反映されました。"});
    }

    if(action==="reissue-partner-approval"){
      if(!(await boardAccess(store,request,context)))return json({error:"unauthorized"},401);
      const data=await loadData(store);
      if(data.partnerApprovalEnabled!==true)return json({error:"交代相手の承認リンクは現在使用されていません。"},404);
      const id=String(body?.id||"");
      const requestNo=String(body?.requestNo||"");
      const idx=data.requests.findIndex(item=>item.status==="pending"&&((id&&item.id===id)||(requestNo&&item.requestNo===requestNo)));
      if(idx<0)return json({error:"確認待ちの申請が見つかりません。"},404);
      const item=data.requests[idx];
      if((item.approvalMode||"admin")!=="family")return json({error:"この申請は管理者承認です。LINE承認リンクは使用しません。"},409);
      const expires=Date.parse(item.approvalExpiresAt||"");
      if(Number.isFinite(expires)&&Date.now()>expires)return json({error:"承認リンクの有効期限が切れています。再度「当番変更申請」から申請してください。"},410);
      let requesterLineHash=item.requesterLineHash||"";
      const resendSession=await getLineSession(request);
      if(!resendSession){
        return json({
          error:"LINE認証が必要です。",
          code:"line_login_required",
          loginUrl:lineLoginStartUrl(request,"/board.html?line_resume=duty-resend")
        },401);
      }
      const resendHash=await lineIdentityHash(resendSession.sub);
      if(requesterLineHash&&requesterLineHash!==resendHash)return json({error:"この申請のLINE再送は、申請した方のLINEアカウントから行ってください。",code:"requester_line_mismatch"},403);
      requesterLineHash=resendHash;
      const issuedApprovalToken=newApprovalToken();
      const approvalTokenHash=await sha256(issuedApprovalToken);
      const approvalExpiresAt=new Date(Date.now()+APPROVAL_TTL_MS).toISOString();
      const now=new Date().toISOString();
      data.requests[idx]={...item,requesterLineHash,approvalTokenHash,approvalTokenHashes:appendApprovalHash(item,approvalTokenHash),approvalExpiresAt,updatedAt:now};
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data),approvalUrl:approvalUrl(request,issuedApprovalToken),approvalExpiresAt});
    }

    if(action==="submit"){
      if(!(await boardAccess(store,request,context)))return json({error:"unauthorized"},401);
      const date=String(body?.request?.date||"");
      const fromGrade=String(body?.request?.fromGrade||"");
      const toGrade=String(body?.request?.toGrade||"");
      const fromName=cleanName(body?.request?.fromName);
      const toName=cleanName(body?.request?.toName);
      const requestType=String(body?.request?.requestType||"replace")==="swap"?"swap":"replace";
      const swapDate=String(body?.request?.swapDate||"");
      const swapGrade=String(body?.request?.swapGrade||"");
      const swapName=cleanName(body?.request?.swapName);
      const noLineFallback=body?.request?.noLineFallback===true;
      const requesterDeviceToken=String(request.headers.get("x-duty-requester-device")||"").trim();
      const requesterDeviceHash=requesterDeviceToken?await sha256(requesterDeviceToken):"";
      const swapInvalid=requestType==="swap"&&(!validDate(swapDate)||!validGrade(swapGrade)||!swapName);
      if(!validDate(date)||!validGrade(fromGrade)||!validGrade(toGrade)||!fromName||!toName||(fromGrade===toGrade&&fromName===toName)||swapInvalid){
        return json({error:"申請内容を確認してください。"},400);
      }
      const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"});
      if(!requestMatchesRoster(roster,date,fromGrade,fromName)){
        return json({error:"変更前の名前が現在の当番表と一致しません。当番表を確認してもう一度選択してください。"},400);
      }
      if(requestType==="swap"&&!requestMatchesRoster(roster,swapDate,swapGrade,swapName)){
        return json({error:"入れ替える相手のお当番日と担当者が一致しません。"},400);
      }

      const data=await loadData(store);
      const approvalMode=data.partnerApprovalEnabled===true&&!noLineFallback?"family":"admin";
      let requesterLineHash="";
      if(approvalMode==="family"){
        const submitSession=await getLineSession(request);
        if(!submitSession){
          // Persist first, then authenticate. The sealed return path carries the
          // exact pending request id so the callback cannot create/lose another copy.
          const now=new Date().toISOString();
          const existingIdx=data.requests.findIndex(item=>item.status==="pending"&&item.date===date&&item.fromGrade===fromGrade&&item.fromName===fromName&&String(item.requestType||"replace")===requestType&&String(item.swapDate||"")===swapDate);
          let pendingItem;
          if(existingIdx>=0){
            pendingItem={...data.requests[existingIdx],toGrade,toName,requestType,swapDate,swapGrade,swapName,approvalMode:"family",updatedAt:now,partnerApprovedAt:"",requesterDevice:clientLabel(request)};
            data.requests[existingIdx]=pendingItem;
          }else{
            if(data.requests.length>=MAX_REQUESTS)return json({error:"申請の保存上限に達しています。管理者へ連絡してください。"},400);
            const next=nextRequestNo(data);data.requestSeq=next.seq;
            pendingItem={
              id:`request-${crypto.randomUUID()}`,requestNo:next.value,date,
              fromGrade,fromName,toGrade,toName,requestType,swapDate,swapGrade,swapName,
              approvalMode:"family",status:"pending",createdAt:now,updatedAt:now,
              approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:"",partnerApprovedAt:"",
              requesterLineHash:"",requesterDevice:clientLabel(request),requesterDeviceHash,approverDevice:""
            };
            data.requests.push(pendingItem);
          }
          data.requests=dedupePending(data.requests);
          const resumePath="/board.html?line_resume=duty-submit"+
            "&rid="+encodeURIComponent(pendingItem.id)+
            "&d="+encodeURIComponent(date)+
            "&fg="+encodeURIComponent(fromGrade)+
            "&fn="+encodeURIComponent(fromName)+
            "&tg="+encodeURIComponent(toGrade)+
            "&tn="+encodeURIComponent(toName)+
            "&rt="+encodeURIComponent(requestType)+
            "&sd="+encodeURIComponent(swapDate)+
            "&sg="+encodeURIComponent(swapGrade)+
            "&sn="+encodeURIComponent(swapName);

          pushMonitorEvent(data,{
            stage:"request_pending_auth",level:"info",requestNo:pendingItem.requestNo,
            flowKey:[date,fromGrade,fromName].join("|"),
            device:clientLabel(request),
            message:"確認待ちとして保存し、申請者のLINE認証を開始しました。"
          });
          await store.setJSON(KEY,data);
          return json({
            error:"LINE認証が必要です.",
            code:"line_login_required",
            request:publicRequest(pendingItem),
            loginUrl:lineLoginStartUrl(request,resumePath)
          },401);
        }
        requesterLineHash=await lineIdentityHash(submitSession.sub);
      }
      const now=new Date().toISOString();
      const idx=data.requests.findIndex(item=>item.status==="pending"&&item.date===date&&item.fromGrade===fromGrade&&item.fromName===fromName&&String(item.requestType||"replace")===requestType&&String(item.swapDate||"")===swapDate);
      let issuedApprovalToken="";
      let approvalTokenHash="";
      let approvalExpiresAt="";
      if(approvalMode==="family"){
        issuedApprovalToken=newApprovalToken();
        approvalTokenHash=await sha256(issuedApprovalToken);
        approvalExpiresAt=new Date(Date.now()+APPROVAL_TTL_MS).toISOString();
      }
      if(idx>=0){
        data.requests[idx]={...data.requests[idx],toGrade,toName,requestType,swapDate,swapGrade,swapName,approvalMode,updatedAt:now,approvalTokenHash,approvalTokenHashes:approvalMode==="family"?appendApprovalHash(data.requests[idx],approvalTokenHash):[],approvalExpiresAt,partnerApprovedAt:"",requesterLineHash:approvalMode==="family"?(requesterLineHash||data.requests[idx].requesterLineHash||""):"",requesterDevice:clientLabel(request),requesterDeviceHash:requesterDeviceHash||data.requests[idx].requesterDeviceHash||""};
      }else{
        if(data.requests.length>=MAX_REQUESTS)return json({error:"申請の保存上限に達しています。管理者へ連絡してください。"},400);
        const next=nextRequestNo(data);data.requestSeq=next.seq;
        data.requests.push({
          id:`request-${crypto.randomUUID()}`,requestNo:next.value,date,
          fromGrade,fromName,toGrade,toName,requestType,swapDate,swapGrade,swapName,approvalMode,status:"pending",createdAt:now,updatedAt:now,
          approvalTokenHash,approvalTokenHashes:approvalTokenHash?[approvalTokenHash]:[],approvalExpiresAt,partnerApprovedAt:"",requesterLineHash,requesterDevice:clientLabel(request),requesterDeviceHash,approverDevice:""
        });
      }
      data.requests=dedupePending(data.requests);
      await store.setJSON(KEY,data);
      if(approvalMode==="admin"&&data.partnerApprovalEnabled===true){
        const saved=data.requests.find(item=>item.status==="pending"&&item.date===date&&item.fromGrade===fromGrade&&item.fromName===fromName&&String(item.requestType||"replace")===requestType&&String(item.swapDate||"")===swapDate);
        pushMonitorEvent(data,{
          stage:"admin_fallback_created",level:"info",requestNo:saved?.requestNo||"",
          flowKey:[date,fromGrade,fromName].join("|"),
          device:clientLabel(request),
          message:"LINE未使用のため管理者承認へ切り替えました。"
        });
        await store.setJSON(KEY,data);
      }
      const extra=approvalMode==="family"&&issuedApprovalToken?{approvalUrl:approvalUrl(request,issuedApprovalToken),approvalExpiresAt}:{};
      return json({ok:true,...publicData(data,requesterLineHash,requesterDeviceHash),...extra});
    }

    if(action==="requester-cancel"){
      if(!(await boardAccess(store,request,context)))return json({error:"unauthorized"},401);
      const data=await loadData(store);
      const id=String(body?.id||"");
      const idx=data.requests.findIndex(item=>item.id===id);
      if(idx<0)return json({error:"申請が見つかりません。"},404);
      const item=data.requests[idx];
      if(item.status!=="pending")return json({error:"この申請はすでに処理済みです。"},409);

      const mode=item.approvalMode||"admin";
      let requesterHash="";
      let requesterDeviceHash="";
      if(mode==="family"){
        const session=await getLineSession(request);
        if(!session)return json({error:"申請したLINEアカウントで本人確認できませんでした。",code:"line_session_required"},401);
        requesterHash=await lineIdentityHash(session.sub);
        if(!item.requesterLineHash||requesterHash!==item.requesterLineHash){
          return json({error:"この申請は申請者本人のみ取り消せます。",code:"not_requester"},403);
        }
      }else{
        const requesterDeviceToken=String(request.headers.get("x-duty-requester-device")||"").trim();
        requesterDeviceHash=requesterDeviceToken?await sha256(requesterDeviceToken):"";
        if(!item.requesterDeviceHash||!requesterDeviceHash||requesterDeviceHash!==item.requesterDeviceHash){
          return json({error:"この申請は、申請した端末からのみ取り消せます。",code:"not_requester_device"},403);
        }
      }

      data.requests[idx]={...item,status:"closed",updatedAt:new Date().toISOString(),approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:""};
      pushMonitorEvent(data,{stage:"requester_cancelled",level:"ok",requestNo:item.requestNo,device:clientLabel(request),message:"申請者が確認待ち申請を取り消しました。"});
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data,requesterHash,requesterDeviceHash)});
    }

    const auth=await adminAccess(store,request,context);
    if(!auth.ok)return adminAuthError(json,auth);

    const data=await loadData(store);

    if(action==="monitor"){
      const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"})||{};
      return json({ok:true,monitor:monitorSnapshot(data,roster)});
    }

    if(action==="set-partner-approval"){
      data.partnerApprovalEnabled=body?.enabled===true;
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    if(action==="close"){
      const requestNo=String(body?.requestNo||"");
      const id=String(body?.id||"");
      const idx=data.requests.findIndex(item=>(id&&item.id===id)||(requestNo&&item.requestNo===requestNo));
      if(idx<0)return json({error:"申請が見つかりません。"},404);
      const item=data.requests[idx];
      data.requests[idx]={...item,status:"closed",updatedAt:new Date().toISOString(),approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:""};
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    const id=String(body?.id||"");
    const idx=data.requests.findIndex(item=>item.id===id);
    if(idx<0)return json({error:"申請が見つかりません。"},404);
    const item=data.requests[idx];

    if(action==="approve"){
      if(item.status!=="pending")return json({error:"この申請は処理済みです。"},409);
      const applied=await applyRequestToRoster(store,item);
      if(!applied.ok)return json({error:applied.error},409);
      data.requests[idx]={...item,status:"approved",updatedAt:new Date().toISOString(),approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:""};
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    if(action==="reject"){
      if(item.status!=="pending")return json({error:"この申請は処理済みです。"},409);
      data.requests[idx]={...item,status:"rejected",updatedAt:new Date().toISOString(),approvalTokenHash:"",approvalTokenHashes:[],approvalExpiresAt:""};
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    return json({error:"invalid action"},400);
  }catch(error){
    console.error("duty-change-requests",error);
    return json({error:"当番変更申請を処理できませんでした。"},500);
  }
};
