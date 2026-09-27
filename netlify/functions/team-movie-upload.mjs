import { getStore } from "@netlify/blobs";
import { adminAuthError, verifyAdminPassword } from "./admin-rate-limit.mjs";
const STORE_NAME="yachiyo-public-site", META_KEY="content/team-movie.json", VIDEO_KEY="team-movie/current-video.bin";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default async(request,context)=>{
 const store=getStore({name:STORE_NAME,consistency:"strong"});
 const auth=await verifyAdminPassword({store,request,context,expectedPassword:process.env.ADMIN_PASSWORD||""});
 if(!auth.ok)return adminAuthError(json,auth);
 try{
  if(request.method!=="POST")return json({error:"method not allowed"},405);
  const type=String(request.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  const allowed=new Set(["video/mp4","video/quicktime","video/x-m4v","video/webm"]);
  if(!allowed.has(type))return json({error:"対応していない動画形式です。"},400);
  const length=Number(request.headers.get("content-length")||0);
  if(length>50*1024*1024)return json({error:"動画は50MB以下にしてください。"},413);
  const bytes=await request.arrayBuffer();
  if(!bytes.byteLength)return json({error:"動画ファイルが空です。"},400);
  if(bytes.byteLength>50*1024*1024)return json({error:"動画は50MB以下にしてください。"},413);
  const fileName=decodeURIComponent(String(request.headers.get("x-file-name")||"team-movie"));
  await store.set(VIDEO_KEY,bytes,{metadata:{fileName,contentType:type}});
  const old=await store.get(META_KEY,{type:"json",consistency:"strong"})||{};
  const data={...old,storageKey:VIDEO_KEY,fileName,contentType:type,size:bytes.byteLength,updatedAt:new Date().toISOString()};
  delete data.video;
  await store.setJSON(META_KEY,data);
  return json({ok:true,data});
 }catch(e){console.error("team-movie-upload",e);return json({error:"動画を保存できませんでした。"},500)}
};