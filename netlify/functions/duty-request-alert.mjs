import { getStore } from "@netlify/blobs";
import { verifyAccessPassword } from "./_access-password.mjs";
import { boardSessionIsValid } from "./_board-session.mjs";
import { verifyAdminPassword } from "./admin-rate-limit.mjs";

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

export default async (request,context) => {
  if(request.method!=="GET")return json({error:"method not allowed"},405);
  try{
    const store=getStore({name:"yachiyo-public-site",consistency:"strong"});
    const details=new URL(request.url).searchParams.get("details")==="1";
    if(details){
      let accessGranted=await boardSessionIsValid(request);
      const adminPassword=request.headers.get("x-admin-password")||"";
      const accessPassword=request.headers.get("x-access-password")||"";
      if(!accessGranted&&adminPassword){
        const auth=await verifyAdminPassword({store,request,context,expectedPassword:process.env.ADMIN_PASSWORD||""});
        accessGranted=auth.ok===true;
      }
      if(!accessGranted&&accessPassword){
        accessGranted=await verifyAccessPassword({role:"board",store,request,context,password:accessPassword});
      }
      if(!accessGranted)return json({error:"unauthorized"},401);
    }
    const data=await store.get("content/duty-roster.json",{type:"json",consistency:"strong"});
    if(data&&data.requests!==undefined&&!Array.isArray(data.requests))throw new Error("invalid request data");
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
    return json({ok:true,hasPending:pendingCount>0,pendingCount,...(details?{requests}: {})});
  }catch(_){
    // Failure is unknown, never a successful zero count. This endpoint never writes data.
    return json({ok:false,error:"当番変更申請を取得できませんでした。"},503);
  }
};
