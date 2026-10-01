import { getStore } from "@netlify/blobs";
import { verifyAccessPassword } from "./_access-password.mjs";
import { boardSessionIsValid } from "./_board-session.mjs";
import { verifyAdminPassword, adminAuthError } from "./admin-rate-limit.mjs";

const STORE_NAME="yachiyo-public-site";
const KEY="content/duty-change-requests.json";
const LEGACY_KEY="content/duty-roster.json";
const MAX_REQUESTS=300;

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
function validGrade(value){return ["1","2","3"].includes(String(value||""))}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""))}
function normalizeStatus(value){return ["pending","approved","rejected"].includes(String(value))?String(value):"pending"}
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
    status:normalizeStatus(item?.status),
    createdAt:String(item?.createdAt||"").slice(0,60),
    updatedAt:String(item?.updatedAt||"").slice(0,60)
  };
}
function dedupePending(items){
  const out=[],pending=new Map();
  for(const item of items){
    if(item.status!=="pending"){out.push(item);continue;}
    const key=[item.date,item.fromGrade,item.fromName].join("|");
    if(!pending.has(key)){pending.set(key,out.length);out.push(item);continue;}
    const idx=pending.get(key),current=out[idx];
    const a=Date.parse(current.updatedAt||current.createdAt||"")||0;
    const b=Date.parse(item.updatedAt||item.createdAt||"")||0;
    if(b>=a)out[idx]=item;
  }
  return out;
}
function nextRequestNo(data){
  let seq=Math.max(0,Number(data?.requestSeq)||0);
  const used=new Set((data?.requests||[]).map(item=>String(item?.requestNo||"").toUpperCase()));
  let value="";
  do{seq+=1;value=`A${String(seq).padStart(3,"0")}`;}while(used.has(value));
  return{seq,value};
}
async function loadData(store){
  let data;
  const existing=await store.get(KEY,{type:"json",consistency:"strong"});
  if(existing?.version===1&&Array.isArray(existing.requests)){
    data={version:1,requestSeq:Math.max(0,Number(existing.requestSeq)||0),requests:dedupePending(existing.requests.map(normalizeItem).filter(Boolean))};
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
    data={version:1,requestSeq:seq,requests:migrated,migratedAt:new Date().toISOString()};
    await store.setJSON(KEY,data);
  }

  // "反映済み" は当番表側に実際の変更履歴が存在する時だけ成立する。
  const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"})||{};
  const changes=Array.isArray(roster.changes)?roster.changes:[];
  let reconciled=false;
  data.requests=data.requests.map(item=>{
    if(item.status!=="approved")return item;
    const reflected=changes.some(change=>
      String(change?.status||"active")!=="cancelled" &&
      (
        (item.requestNo&&String(change?.requestNo||"")===item.requestNo) ||
        (
          String(change?.date||"")===item.date &&
          String(change?.grade||"")===item.fromGrade &&
          cleanName(change?.from)===item.fromName
        )
      )
    );
    if(reflected)return item;
    reconciled=true;
    return{...item,status:"pending",updatedAt:new Date().toISOString()};
  });
  data.requests=dedupePending(data.requests);
  if(reconciled)await store.setJSON(KEY,data);
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
function publicData(data){
  return{
    requests:data.requests.map(item=>({...item})),
    pendingCount:data.requests.filter(item=>item.status==="pending").length
  };
}
function requestMatchesRoster(roster,date,fromGrade,fromName){
  const selected=new Date(`${date}T00:00:00`);
  const images=Array.isArray(roster?.images)?roster.images:[];
  return images.some(image=>{
    const table=image?.table;
    if(!table||!Array.isArray(table.rows))return false;
    if(Number(table.year)!==selected.getFullYear()||Number(table.month)!==selected.getMonth()+1)return false;
    const day=selected.getDate();
    const grades=Array.isArray(table.grades)&&table.grades.length?table.grades:[2,1];
    return table.rows.some(row=>{
      if(!Array.isArray(row)||Number(String(row[0]||"").replace(/\D/g,""))!==day)return false;
      return row.slice(2,6).some((name,index)=>String(grades[Math.floor(index/2)])===fromGrade&&cleanName(name)===fromName);
    });
  });
}

export default async (request,context)=>{
  const store=getStore({name:STORE_NAME,consistency:"strong"});
  try{
    if(request.method==="GET"){
      if(!(await boardAccess(store,request,context)))return json({error:"unauthorized"},401);
      const data=await loadData(store);
      return json({ok:true,...publicData(data)});
    }
    if(request.method!=="POST")return json({error:"method not allowed"},405);

    let body;
    try{body=await request.json();}catch{return json({error:"invalid json"},400);}
    const action=String(body?.action||"");

    if(action==="submit"){
      if(!(await boardAccess(store,request,context)))return json({error:"unauthorized"},401);
      const date=String(body?.request?.date||"");
      const fromGrade=String(body?.request?.fromGrade||"");
      const toGrade=String(body?.request?.toGrade||"");
      const fromName=cleanName(body?.request?.fromName);
      const toName=cleanName(body?.request?.toName);
      if(!validDate(date)||!validGrade(fromGrade)||!validGrade(toGrade)||!fromName||!toName||(fromGrade===toGrade&&fromName===toName)){
        return json({error:"申請内容を確認してください。"},400);
      }
      const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"});
      if(!requestMatchesRoster(roster,date,fromGrade,fromName)){
        return json({error:"変更前の名前が現在の当番表と一致しません。当番表を確認してもう一度選択してください。"},400);
      }

      const data=await loadData(store);
      const now=new Date().toISOString();
      const idx=data.requests.findIndex(item=>item.status==="pending"&&item.date===date&&item.fromGrade===fromGrade&&item.fromName===fromName);
      if(idx>=0){
        data.requests[idx]={...data.requests[idx],toGrade,toName,updatedAt:now};
      }else{
        if(data.requests.length>=MAX_REQUESTS)return json({error:"申請の保存上限に達しています。管理者へ連絡してください。"},400);
        const next=nextRequestNo(data);data.requestSeq=next.seq;
        data.requests.push({
          id:`request-${crypto.randomUUID()}`,requestNo:next.value,date,
          fromGrade,fromName,toGrade,toName,status:"pending",createdAt:now,updatedAt:now
        });
      }
      data.requests=dedupePending(data.requests);
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    const auth=await adminAccess(store,request,context);
    if(!auth.ok)return adminAuthError(json,auth);

    const data=await loadData(store);
    const id=String(body?.id||"");
    const idx=data.requests.findIndex(item=>item.id===id);
    if(idx<0)return json({error:"申請が見つかりません。"},404);
    const item=data.requests[idx];

    if(action==="approve"){
      if(item.status!=="pending")return json({error:"この申請は処理済みです。"},409);
      const roster=await store.get(LEGACY_KEY,{type:"json",consistency:"strong"})||{initialized:true,images:[],changes:[]};
      if(!requestMatchesRoster(roster,item.date,item.fromGrade,item.fromName)){
        return json({error:"対象月の当番表が登録されていないか、変更前の担当者が一致しません。"},409);
      }
      const changes=Array.isArray(roster.changes)?roster.changes.slice():[];
      const cidx=changes.findIndex(x=>String(x?.date||"")===item.date&&String(x?.grade||"")===item.fromGrade&&cleanName(x?.from)===item.fromName);
      const change={
        id:cidx>=0?String(changes[cidx].id||`change-${crypto.randomUUID()}`):`change-${crypto.randomUUID()}`,
        requestNo:item.requestNo,date:item.date,grade:item.fromGrade,from:item.fromName,to:item.toName,toGrade:item.toGrade,
        status:"active",createdAt:new Date().toISOString()
      };
      if(cidx>=0)changes[cidx]=change;else changes.push(change);
      await store.setJSON(LEGACY_KEY,{...roster,changes});
      data.requests[idx]={...item,status:"approved",updatedAt:new Date().toISOString()};
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    if(action==="reject"){
      if(item.status!=="pending")return json({error:"この申請は処理済みです。"},409);
      data.requests[idx]={...item,status:"rejected",updatedAt:new Date().toISOString()};
      await store.setJSON(KEY,data);
      return json({ok:true,...publicData(data)});
    }

    return json({error:"invalid action"},400);
  }catch(error){
    console.error("duty-change-requests",error);
    return json({error:"当番変更申請を処理できませんでした。"},500);
  }
};
