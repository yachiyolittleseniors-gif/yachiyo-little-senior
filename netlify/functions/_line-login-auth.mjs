const SESSION_COOKIE="yls_line_auth";
const FLOW_COOKIE="yls_line_flow";
const SESSION_TTL_SECONDS=180*24*60*60;
const FLOW_TTL_SECONDS=10*60;
const DEFAULT_CALLBACK_URL="https://yachiyo-little-senior.netlify.app/.netlify/functions/line-login-callback";

function secret(){
  return String(process.env.LINE_LOGIN_CHANNEL_SECRET||"");
}
export function lineChannelId(){
  return String(process.env.LINE_LOGIN_CHANNEL_ID||"");
}
export function lineCallbackUrl(){
  return String(process.env.LINE_LOGIN_CALLBACK_URL||DEFAULT_CALLBACK_URL);
}
function base64urlBytes(bytes){
  return Buffer.from(bytes).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function base64urlText(value){
  return base64urlBytes(new TextEncoder().encode(String(value)));
}
function decodeBase64urlText(value){
  const normalized=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized+"=".repeat((4-normalized.length%4)%4);
  return Buffer.from(padded,"base64").toString("utf8");
}
async function hmac(value){
  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(String(value)));
  return base64urlBytes(new Uint8Array(sig));
}
export async function sealLineValue(data){
  if(!secret())throw new Error("LINE login secret is not configured");
  const payload=base64urlText(JSON.stringify(data));
  return payload+"."+await hmac(payload);
}
export async function unsealLineValue(value){
  try{
    const [payload,sig,...extra]=String(value||"").split(".");
    if(!payload||!sig||extra.length)return null;
    if(await hmac(payload)!==sig)return null;
    const data=JSON.parse(decodeBase64urlText(payload));
    return data&&typeof data==="object"?data:null;
  }catch{return null}
}
export function parseCookies(request){
  const raw=request.headers.get("cookie")||"";
  const out={};
  raw.split(";").forEach(part=>{
    const i=part.indexOf("=");
    if(i<1)return;
    const key=part.slice(0,i).trim();
    const value=part.slice(i+1).trim();
    try{out[key]=decodeURIComponent(value)}catch{out[key]=value}
  });
  return out;
}
function cookie(name,value,maxAge){
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0,Math.floor(maxAge))}; HttpOnly; Secure; SameSite=Lax`;
}
export function flowCookie(value){return cookie(FLOW_COOKIE,value,FLOW_TTL_SECONDS)}
export function clearFlowCookie(){return cookie(FLOW_COOKIE,"",0)}
export function sessionCookie(value){return cookie(SESSION_COOKIE,value,SESSION_TTL_SECONDS)}
export async function getLineFlow(request){
  return unsealLineValue(parseCookies(request)[FLOW_COOKIE]||"");
}
export async function getLineSession(request){
  const data=await unsealLineValue(parseCookies(request)[SESSION_COOKIE]||"");
  if(!data||!data.sub||!Number.isFinite(Number(data.exp))||Date.now()>Number(data.exp))return null;
  return data;
}
export async function lineIdentityHash(sub){
  if(!sub)return "";
  return hmac("line-user:"+String(sub));
}
export function safeReturnPath(value){
  const raw=String(value||"").trim();
  if(!raw.startsWith("/")||raw.startsWith("//"))return "/board.html";
  try{
    const u=new URL(raw,"https://local.invalid");
    return u.pathname+u.search+u.hash;
  }catch{return "/board.html"}
}
export function lineLoginStartUrl(request,returnPath){
  const u=new URL("/.netlify/functions/line-login-start",new URL(request.url).origin);
  u.searchParams.set("return",safeReturnPath(returnPath));
  return u.toString();
}
export function randomBase64url(size=32){
  const bytes=new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64urlBytes(bytes);
}
export async function sha256Base64url(value){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)));
  return base64urlBytes(new Uint8Array(digest));
}
export const LINE_FLOW_COOKIE=FLOW_COOKIE;
