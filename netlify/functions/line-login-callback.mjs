import {
  lineChannelId,lineCallbackUrl,getLineFlow,getLineFlowFromState,sealLineValue,sealLineFlow,sessionCookie,
  clearFlowCookie,safeReturnPath
} from "./_line-login-auth.mjs";

function html(message,status=400){
  return new Response(
    '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LINE認証</title><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;line-height:1.8"><h2>LINE認証</h2><p>'+String(message).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p></body></html>',
    {status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}}
  );
}
export default async (request)=>{
  try{
    if(request.method!=="GET")return html("このURLは利用できません。",405);
    const channelId=lineChannelId();
    const channelSecret=String(process.env.LINE_LOGIN_CHANNEL_SECRET||"");
    if(!channelId||!channelSecret)return html("LINEログイン設定が完了していません。",503);

    const url=new URL(request.url);
    const state=String(url.searchParams.get("state")||"");
    const cookieFlow=await getLineFlow(request);
    const stateFlow=await getLineFlowFromState(state);
    const flow=cookieFlow||stateFlow;

    if(!flow||!Number.isFinite(Number(flow.exp))||Date.now()>Number(flow.exp)){
      return html("LINE認証の有効時間が切れました。元の画面からもう一度お試しください。",400);
    }
    if(cookieFlow){
      const cookieState=await getLineFlowFromState(state);
      if(!cookieState)return html("LINE認証の確認情報が一致しません。元の画面からもう一度お試しください。",400);
    }
    if(url.searchParams.get("error"))return html("LINE認証がキャンセルされました。元の画面へ戻ってください。",400);

    const code=String(url.searchParams.get("code")||"");
    if(!code)return html("LINEから認証コードを受け取れませんでした。",400);

    const tokenBody=new URLSearchParams({
      grant_type:"authorization_code",
      code,
      redirect_uri:lineCallbackUrl(),
      client_id:channelId,
      client_secret:channelSecret,
      code_verifier:String(flow.verifier||"")
    });
    const tokenResponse=await fetch("https://api.line.me/oauth2/v2.1/token",{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:tokenBody
    });
    const token=await tokenResponse.json().catch(()=>({}));
    if(!tokenResponse.ok||!token.id_token){
      console.error("line-login token error",token);
      return html("LINE認証を完了できませんでした。元の画面からもう一度お試しください。",400);
    }

    const verifyBody=new URLSearchParams({
      id_token:String(token.id_token),
      client_id:channelId,
      nonce:String(flow.nonce||"")
    });
    const verifyResponse=await fetch("https://api.line.me/oauth2/v2.1/verify",{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:verifyBody
    });
    const verified=await verifyResponse.json().catch(()=>({}));
    if(!verifyResponse.ok||!verified.sub){
      console.error("line-login verify error",verified);
      return html("LINEアカウントを確認できませんでした。",400);
    }

    const session=await sealLineValue({
      sub:String(verified.sub),
      iat:Date.now(),
      exp:Date.now()+180*24*60*60*1000
    });
    const returnPath=safeReturnPath(flow.returnPath||"/board.html");
    const target=new URL(returnPath,"https://local.invalid");
    let locationValue="";
    if(target.searchParams.get("line_resume")==="duty-submit"){
      const resumeToken=await sealLineFlow({
        purpose:"duty-submit",
        date:String(target.searchParams.get("d")||""),
        fromGrade:String(target.searchParams.get("fg")||""),
        fromName:String(target.searchParams.get("fn")||""),
        toGrade:String(target.searchParams.get("tg")||""),
        toName:String(target.searchParams.get("tn")||""),
        sub:String(verified.sub),
        exp:Date.now()+5*60*1000
      });
      locationValue="/.netlify/functions/duty-line-page?t="+encodeURIComponent(resumeToken);
    }else{
      target.searchParams.set("line_login","ok");
      locationValue=target.pathname+target.search+target.hash;
    }

    const headers=new Headers({
      "location":locationValue,
      "cache-control":"no-store",
      "x-content-type-options":"nosniff"
    });
    headers.append("set-cookie",sessionCookie(session));
    headers.append("set-cookie",clearFlowCookie());
    return new Response("",{status:302,headers});
  }catch(error){
    console.error("line-login-callback",error);
    return html("LINE認証を処理できませんでした。もう一度お試しください。",500);
  }
};
