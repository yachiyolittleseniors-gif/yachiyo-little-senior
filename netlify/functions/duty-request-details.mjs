import { getStore } from "@netlify/blobs";
import { verifyAccessPassword } from "./_access-password.mjs";
import { boardSessionIsValid } from "./_board-session.mjs";

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
    const accessPassword=request.headers.get("x-access-password")||"";
    const accessGranted =
      await boardSessionIsValid(request) ||
      await verifyAccessPassword({role:"board",store,request,context,password:accessPassword});
    if(!accessGranted)return json({error:"unauthorized"},401);

    const data=await store.get("content/duty-roster.json",{type:"json",consistency:"strong"});
    const requests=Array.isArray(data?.requests)?data.requests:[];
    return json({requests});
  }catch(_){
    return json({error:"unavailable"},503);
  }
};
