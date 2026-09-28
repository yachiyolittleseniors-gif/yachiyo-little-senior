import { getStore } from "@netlify/blobs";
import { adminAuthError, verifyAdminPassword } from "./admin-rate-limit.mjs";

const STORE_NAME="yachiyo-public-site";
const META_KEY="content/team-movie.json";
const CHUNK_PREFIX="team-movie/chunks/";
const MAX_CHUNK=3*1024*1024;
const MAX_TOTAL=50*1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

export default async(request,context)=>{
  const store=getStore({name:STORE_NAME,consistency:"strong"});
  try{
    if(request.method==="GET"){
      const index=Number(new URL(request.url).searchParams.get("chunk"));
      if(!Number.isInteger(index)||index<0)return json({error:"invalid chunk"},400);
      const meta=await store.get(META_KEY,{type:"json",consistency:"strong"})||{};
      if(!Number.isInteger(meta.chunkCount)||index>=meta.chunkCount)return new Response("Chunk not found",{status:404});
      const blob=await store.get(CHUNK_PREFIX+index,{type:"blob",consistency:"strong"});
      if(!blob)return new Response("Chunk not found",{status:404});
      return new Response(blob,{status:200,headers:{"content-type":"application/octet-stream","cache-control":"public, max-age=3600","x-content-type-options":"nosniff"}});
    }
    if(request.method!=="POST")return json({error:"method not allowed"},405);

    const auth=await verifyAdminPassword({store,request,context,expectedPassword:process.env.ADMIN_PASSWORD||""});
    if(!auth.ok)return adminAuthError(json,auth);

    const type=String(request.headers.get("x-video-type")||"").trim().toLowerCase();
    const allowed=new Set(["video/mp4","video/quicktime","video/x-m4v","video/webm"]);
    if(!allowed.has(type))return json({error:"対応していない動画形式です。"},400);

    const index=Number(request.headers.get("x-chunk-index"));
    const count=Number(request.headers.get("x-chunk-count"));
    const totalSize=Number(request.headers.get("x-total-size"));
    if(!Number.isInteger(index)||index<0||!Number.isInteger(count)||count<1||index>=count)return json({error:"動画データを確認してください。"},400);
    if(!Number.isFinite(totalSize)||totalSize<1||totalSize>MAX_TOTAL)return json({error:"動画は50MB以下にしてください。"},413);

    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength)return json({error:"動画ファイルが空です。"},400);
    if(bytes.byteLength>MAX_CHUNK)return json({error:"動画の分割サイズが大きすぎます。"},413);

    if(index===0){
      const old=await store.get(META_KEY,{type:"json",consistency:"strong"})||{};
      const oldCount=Number(old.chunkCount)||0;
      for(let i=0;i<oldCount;i++)await store.delete(CHUNK_PREFIX+i).catch(()=>{});
      if(old.storageKey)await store.delete(old.storageKey).catch(()=>{});
    }

    await store.set(CHUNK_PREFIX+index,bytes,{metadata:{index,count}});

    if(index===count-1){
      const fileName=decodeURIComponent(String(request.headers.get("x-file-name")||"team-movie"));
      const old=await store.get(META_KEY,{type:"json",consistency:"strong"})||{};
      const data={...old,storageKey:"chunks",chunkCount:count,fileName,contentType:type,size:totalSize,updatedAt:new Date().toISOString()};
      delete data.video;
      await store.setJSON(META_KEY,data);
      return json({ok:true,data});
    }
    return json({ok:true,index});
  }catch(e){
    console.error("team-movie-upload",e);
    return json({error:"動画を保存できませんでした。"},500);
  }
};