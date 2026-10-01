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
    const hasPending=requests.some(function(item){
      return item&&String(item.status||"pending")==="pending";
    });
    return json({hasPending});
  }catch(_){
    return json({hasPending:false});
  }
};
