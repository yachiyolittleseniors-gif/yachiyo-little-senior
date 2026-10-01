import { getStore } from "@netlify/blobs";

function json(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store, max-age=0, must-revalidate",
      "netlify-cdn-cache-control":"no-store",
      "cdn-cache-control":"no-store",
      "x-content-type-options":"nosniff"
    }
  });
}
function cleanName(value){return String(value||"").trim().replace(/[　\s]+/g," ")}
function keyOf(item){
  const date=String(item?.date||"");
  const grade=String(item?.fromGrade||item?.grade||"");
  const from=cleanName(item?.fromName||item?.from);
  return date+"|"+grade+"|"+from;
}

export default async (request)=>{
  if(request.method!=="GET")return json({error:"method not allowed"},405);
  try{
    const store=getStore({name:"yachiyo-public-site",consistency:"strong"});
    let data=await store.get("content/duty-change-requests.json",{type:"json",consistency:"strong"});
    let requests=Array.isArray(data?.requests)?data.requests:null;
    if(!requests){
      const legacy=await store.get("content/duty-roster.json",{type:"json",consistency:"strong"});
      requests=Array.isArray(legacy?.requests)?legacy.requests:[];
    }
    const unique=new Set();
    requests.forEach(item=>{
      if(item&&String(item.status||"pending")==="pending")unique.add(keyOf(item));
    });
    return json({ok:true,hasPending:unique.size>0,pendingCount:unique.size});
  }catch(_){
    return json({ok:false,error:"申請件数を確認できませんでした。"},503);
  }
};
