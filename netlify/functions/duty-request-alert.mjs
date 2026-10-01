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

export default async (request) => {
  if(request.method!=="GET")return json({error:"method not allowed"},405);
  try{
    const store=getStore({name:"yachiyo-public-site",consistency:"strong"});
    const data=await store.get("content/duty-roster.json",{type:"json",consistency:"strong"});
    const requests=Array.isArray(data?.requests)?data.requests:[];
    const uniquePending=new Set();
    requests.forEach(function(item){
      if(!item||String(item.status||"pending")!=="pending")return;
      const date=String(item.date||"");
      const grade=String(item.fromGrade||item.grade||"");
      const from=String(item.from||"").trim().replace(/[　\s]+/g," ");
      uniquePending.add(date+"|"+grade+"|"+from);
    });
    const pendingCount=uniquePending.size;
    return json({hasPending:pendingCount>0,pendingCount});
  }catch(_){
    return json({error:"unavailable"},503);
  }
};
