import {
  lineChannelId,lineCallbackUrl,safeReturnPath,randomBase64url,sha256Base64url,
  sealLineFlow,flowCookie
} from "./_line-login-auth.mjs";

function response(body,status=200,headers={}){
  return new Response(body,{status,headers});
}
export default async (request)=>{
  try{
    if(request.method!=="GET")return response("Method not allowed",405);
    const channelId=lineChannelId();
    const channelSecret=String(process.env.LINE_LOGIN_CHANNEL_SECRET||"");
    if(!channelId||!channelSecret)return response("LINE Login is not configured",503);

    const url=new URL(request.url);
    const returnPath=safeReturnPath(url.searchParams.get("return")||"/board.html");
    const nonce=randomBase64url(24);
    const verifier=randomBase64url(48);
    const challenge=await sha256Base64url(verifier);
    const flow=await sealLineFlow({
      nonce,verifier,returnPath,
      exp:Date.now()+10*60*1000
    });

    const auth=new URL("https://access.line.me/oauth2/v2.1/authorize");
    auth.searchParams.set("response_type","code");
    auth.searchParams.set("client_id",channelId);
    auth.searchParams.set("redirect_uri",lineCallbackUrl());
    auth.searchParams.set("state",flow);
    auth.searchParams.set("scope","openid");
    auth.searchParams.set("nonce",nonce);
    // Approval links are often opened from LINE into an external browser on iPhone.
    // LINE documents that automatic login can fail in some browser/privacy contexts;
    // use the explicit login flow here so the approver can reliably authenticate.
    if(returnPath.startsWith("/duty-approve.html")){
      auth.searchParams.set("disable_auto_login","true");
    }
    auth.searchParams.set("code_challenge",challenge);
    auth.searchParams.set("code_challenge_method","S256");

    const headers=new Headers({
      "location":auth.toString(),
      "cache-control":"no-store",
      "x-content-type-options":"nosniff"
    });
    headers.append("set-cookie",flowCookie(flow));
    return response("",302,headers);
  }catch(error){
    console.error("line-login-start",error);
    return response("LINE Loginを開始できませんでした。",500,{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
  }
};
