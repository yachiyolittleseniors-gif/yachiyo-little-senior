const LIFF_SDK_URL="https://static.line-scdn.net/liff/edge/2/sdk.js";

export default async ()=>{
  try{
    const upstream=await fetch(LIFF_SDK_URL,{headers:{"user-agent":"Yachiyo-Little-Senior-LIFF-Proxy/1.0"}});
    if(!upstream.ok){
      return new Response("/* LIFF SDK unavailable */",{status:502,headers:{
        "content-type":"application/javascript; charset=utf-8",
        "cache-control":"no-store"
      }});
    }
    const body=await upstream.text();
    return new Response(body,{status:200,headers:{
      "content-type":"application/javascript; charset=utf-8",
      "cache-control":"public, max-age=3600",
      "netlify-cdn-cache-control":"public, s-maxage=3600",
      "x-content-type-options":"nosniff"
    }});
  }catch(error){
    console.error("liff-sdk proxy",error);
    return new Response("/* LIFF SDK fetch failed */",{status:502,headers:{
      "content-type":"application/javascript; charset=utf-8",
      "cache-control":"no-store"
    }});
  }
};