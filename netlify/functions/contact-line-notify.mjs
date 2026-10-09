import { timingSafeEqual } from 'node:crypto';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const equals=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
export default async function handler(request){
 if(request.method!=='POST')return reply({error:'method not allowed'},405);
 const secret=process.env.CONTACT_LINE_NOTIFY_SECRET,token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
 if(!secret||!token)return reply({error:'configuration missing'},503);
 if(!equals(request.headers.get('x-contact-notify-secret'),secret))return reply({error:'unauthorized'},401);
 const ids=[process.env.CONTACT_LINE_USER_ID_1,process.env.CONTACT_LINE_USER_ID_2].filter(Boolean);
 if(ids.length!==2||ids.some(id=>!/^U[0-9a-f]{32}$/i.test(id)))return reply({error:'two LINE user IDs required'},503);
 const result=await fetch('https://api.line.me/v2/bot/message/multicast',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:ids,messages:[{type:'text',text:'【八千代リトルシニア】\n新しいお問い合わせメールが届きました。\nお問い合わせ用Gmailをご確認ください。'}]})});
 if(!result.ok)return reply({error:'LINE request failed',status:result.status},502);
 return reply({ok:true});
}
export const config={path:'/api/contact-line-notify'};
