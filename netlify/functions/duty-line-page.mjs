import dutyChangeRequests from "./duty-change-requests.mjs";

function esc(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function displayDate(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  return m?`${Number(m[2])}月${Number(m[3])}日`:String(value||"");
}
function page(body,status=200){
  return new Response(body,{status,headers:{
    "content-type":"text/html; charset=utf-8",
    "cache-control":"no-store, max-age=0, must-revalidate",
    "x-content-type-options":"nosniff"
  }});
}
function errorPage(message,status=400){
  return page(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071426"><title>当番変更申請</title><style>*{box-sizing:border-box}body{margin:0;background:#071426;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif}.wrap{min-height:100dvh;display:grid;place-items:center;padding:20px}.card{width:min(500px,100%);background:#fff;border:1px solid #c79a3b;border-radius:24px;padding:26px 22px;color:#142033}.error{padding:16px;border:1px solid #e8b5ae;border-radius:14px;background:#fff5f3;color:#a2362c;font-weight:800;line-height:1.8}</style><body><div class="wrap"><main class="card"><div class="error">${esc(message)}</div></main></div></body></html>`,status);
}

export default async (request,context)=>{
  try{
    if(request.method!=="GET")return errorPage("このURLは利用できません。",405);
    const token=new URL(request.url).searchParams.get("t")||"";
    if(!token)return errorPage("申請情報を確認できませんでした。");

    const apiRequest=new Request(new URL("/.netlify/functions/duty-change-requests",request.url),{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"submit-line-resume",token})
    });
    const apiResponse=await dutyChangeRequests(apiRequest,context);
    const data=await apiResponse.json().catch(()=>({}));
    if(!apiResponse.ok)return errorPage(data.error||"申請を続行できませんでした。",apiResponse.status||400);

    const q=data.request||{};
    const approvalUrl=String(data.approvalUrl||"");
    if(!approvalUrl)return errorPage("承認リンクを作成できませんでした。",500);

    const text="【当番変更申請"+(q.requestNo?" #"+q.requestNo:"")+"】\n"+
      displayDate(q.date)+"\n"+
      "変更前："+q.fromGrade+"年・"+q.fromName+"\n"+
      "変更後："+q.toGrade+"年・"+q.toName+"\n"+
      "当番変更を申請しました。\n\n"+
      "【変更後のご家庭の方へ】\n"+
      "下の専用リンクから内容を確認して承認してください。\n"+approvalUrl;
    const share="https://line.me/R/share?text="+encodeURIComponent(text);

    return page(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#071426">
<title>当番変更申請｜八千代リトルシニア</title>
<style>
:root{color-scheme:light;--navy:#071426;--gold:#c79a3b;--ink:#142033;--muted:#737b87;--soft:#f7f3e8;--line:#e4dccb;--green:#06c755}
*{box-sizing:border-box}html,body{min-height:100%}
body{margin:0;background:linear-gradient(180deg,#071426 0%,#0b1930 100%);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif}
.wrap{min-height:100dvh;display:grid;place-items:center;padding:18px 16px calc(18px + env(safe-area-inset-bottom))}
.card{overflow:hidden;width:min(500px,100%);background:#fff;border:1px solid rgba(199,154,59,.78);border-radius:24px;padding:0 20px 22px;box-shadow:0 24px 64px rgba(0,0,0,.3)}
.card:before{content:"";display:block;height:4px;margin:0 -20px 16px;background:linear-gradient(90deg,#8f671b,#e2bd67,#8f671b)}
.brand{display:flex;justify-content:center;align-items:center;margin:2px 0 14px}.brand img{display:block;width:min(300px,86%);height:auto;max-height:74px;object-fit:contain}
.section-head{padding-top:4px;border-top:1px solid #eee7d9}.kicker{margin-top:14px;font-size:10px;font-weight:900;letter-spacing:.18em;color:#a87b23}
.title{margin:5px 0 16px;font-size:26px;line-height:1.2;color:var(--navy)}.msg{margin:0;color:#56606d;font-size:14px;line-height:1.8;font-weight:750}.msg b{display:block;margin-bottom:4px;color:var(--navy);font-size:17px}
.detail{margin:16px 0 0;padding:16px;border:1px solid var(--line);border-radius:18px;background:var(--soft)}
.row{display:flex;align-items:center;justify-content:flex-start;gap:16px;padding:10px 0}.row+.row{border-top:1px solid rgba(199,154,59,.18)}
.label{width:76px;flex:0 0 76px;color:#7a818c;font-size:13px;font-weight:800}.value{color:var(--ink);font-size:16px;font-weight:900;line-height:1.4}
.line{display:flex;align-items:center;justify-content:center;width:100%;margin-top:18px;padding:16px;border-radius:15px;background:var(--green);color:#fff;text-decoration:none;font-weight:900;font-size:16px;box-shadow:0 8px 20px rgba(6,199,85,.2)}
.line-badge{display:inline-grid;place-items:center;margin-right:9px;padding:2px 7px;border:2px solid rgba(255,255,255,.9);border-radius:7px;font-size:10px;line-height:1.6}
.small{display:block;margin-top:12px;color:#7c8591;font-size:11px;line-height:1.7;text-align:center}
@media(max-width:390px){.card{padding:0 17px 20px}.card:before{margin:0 -17px 15px}.brand img{width:min(275px,90%)}.title{font-size:24px}.label{width:68px;flex-basis:68px}.value{font-size:15px}}
</style>
</head>
<body>
<div class="wrap"><main class="card">
<div class="brand"><img src="/official-logo-crisp-final.png" alt="八千代リトルシニア"></div>
<div class="section-head"><div class="kicker">DUTY CHANGE REQUEST</div><h1 class="title">当番変更申請</h1></div>
<p class="msg"><b>変更申請を受け付けました</b>変更後のご家庭へ、承認リンクをLINEで送ってください。</p>
<div class="detail">
<div class="row"><span class="label">申請番号</span><span class="value">${esc(q.requestNo?"#"+q.requestNo:"-")}</span></div>
<div class="row"><span class="label">日付</span><span class="value">${esc(displayDate(q.date))}</span></div>
<div class="row"><span class="label">変更前</span><span class="value">${esc(q.fromGrade+"年・"+q.fromName)}</span></div>
<div class="row"><span class="label">変更後</span><span class="value">${esc(q.toGrade+"年・"+q.toName)}</span></div>
</div>
<a class="line" href="${esc(share)}"><span class="line-badge">LINE</span>承認リンクを送る</a>
<small class="small">承認リンクは1回限り・24時間有効です。</small>
</main></div>
</body></html>`);
  }catch(error){
    console.error("duty-line-page",error);
    return errorPage("申請を処理できませんでした。もう一度お試しください。",500);
  }
};
