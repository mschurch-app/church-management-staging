import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import nodemailer, {type SendMailOptions} from 'npm:nodemailer@10.5.0';
import {makeHandler} from './handler.mjs';
import {dispatchJobs} from './delivery.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const lineToken=env('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||env('LINE_CHANNEL_ACCESS_TOKEN');
const smtpUser=env('OFFERING_SMTP_USER'),from=env('OFFERING_SMTP_FROM')||smtpUser,password=env('OFFERING_SMTP_PASSWORD');
const smtpHost=env('OFFERING_SMTP_HOST')||'smtp.gmail.com';
const channelsReady=()=>Boolean(lineToken&&smtpUser&&from&&password);
// The selected Google service uses implicit TLS. Host/port are not request-controlled.
const transporter=from&&password?nodemailer.createTransport({host:smtpHost,port:465,secure:true,auth:{user:smtpUser,pass:password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true}):null;
const rpc=async(action:string,input:unknown)=>{const {data,error}=await db.rpc('thanksgiving_offering_service',{p_action:action,p_input:input});if(error){const known=['forbidden','idempotency_conflict','version_conflict','reason_required','reconciliation_required','manual_review_required','acceptance_required','unavailable','recipient_unavailable'];throw Error(known.find(x=>error.message.includes(x))||'service_unavailable');}return data;};
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(makeHandler({rpc,channelsReady,verifyUser:async(auth:string)=>{const token=auth.match(/^Bearer (\S+)$/)?.[1];if(!token)return null;const {data,error}=await db.auth.getUser(token);return error?null:data.user?.id||null;},hashIP:async(req:Request)=>{
 const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
 return digest('thanksgiving-2026:'+env('SUPABASE_SERVICE_ROLE_KEY')+':'+ip);
},dispatch:(workerKey:string)=>dispatchJobs({rpc,workerKey,lineToken,from,sendMail:transporter?(mail:SendMailOptions)=>transporter.sendMail(mail):null})}));
