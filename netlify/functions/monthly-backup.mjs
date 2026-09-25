import { createBackup } from "./_backup-lib.mjs";
export default async()=>{try{const backup=await createBackup({kind:"monthly",reason:"scheduled-monthly"});return Response.json({ok:true,backup});}catch(error){console.error("monthly-backup",error);return Response.json({ok:false},{status:500});}};
export const config={schedule:"0 0 1 * *"};
