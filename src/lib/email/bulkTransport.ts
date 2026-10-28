import nodemailer from 'nodemailer'
import {SESv2Client,SendEmailCommand} from '@aws-sdk/client-sesv2'
import type {SmtpCredentials} from '@/lib/email'
import {BoundedCache} from '@/lib/boundedCache'

type Delivery={fromName:string;fromEmail?:string;replyTo:string;to:string;subject:string;html:string;text:string;unsubscribeUrl:string;campaignId:string;workspaceId:string}
let ses:SESv2Client|undefined
const smtpPool=new BoundedCache<string,any>({maxEntries:12,maxBytes:1024*1024,ttlMs:30*60*1000,sizeOf:()=>64*1024,onEvict:transport=>{try{transport.close()}catch{}}})

function mail(input:Delivery){return{from:`"${input.fromName.replace(/["\r\n]/g,'')}" <${input.fromEmail||process.env.SES_FROM_EMAIL||`offers@${process.env.SES_SENDING_DOMAIN||'example.invalid'}`}>`,to:input.to,replyTo:input.replyTo,subject:input.subject.replace(/[\r\n]/g,' '),text:input.text,html:input.html,headers:{'List-Unsubscribe':`<${input.unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click','X-Campaign-ID':input.campaignId,'X-Workspace-ID':input.workspaceId}}}
export function bulkTransportConfigured(){return!!(process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY&&(process.env.SES_FROM_EMAIL||process.env.SES_SENDING_DOMAIN))}

export async function sendBulkCampaignEmail(input:Delivery,smtp?:SmtpCredentials|null){
 if(bulkTransportConfigured()){
  ses ||= new SESv2Client({region:process.env.AWS_REGION||'ap-south-1'})
  // The visible From address is deployment-controlled. Tenant input is used
  // only for Reply-To so a workspace cannot impersonate another SES identity.
  const source=process.env.SES_FROM_EMAIL||`offers@${process.env.SES_SENDING_DOMAIN}`
  const compiler=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'})
  const compiled:any=await compiler.sendMail({...mail(input),from:`"${input.fromName.replace(/["\r\n]/g,'')}" <${source}>`}),raw=Buffer.isBuffer(compiled.message)?compiled.message:Buffer.from(compiled.message)
  const result=await ses.send(new SendEmailCommand({FromEmailAddress:source,Destination:{ToAddresses:[input.to]},Content:{Raw:{Data:raw}},ConfigurationSetName:process.env.SES_CONFIGURATION_SET||undefined}))
  return{messageId:result.MessageId||''}
 }
 if(!smtp)throw new Error('Configure AWS SES or an SMTP marketing mailbox before launching a campaign')
 const port=Number(smtp.smtp_port||587),key=`${smtp.smtp_host}:${port}:${smtp.smtp_user}`
 let transport=smtpPool.get(key);if(!transport){transport=nodemailer.createTransport({host:smtp.smtp_host,port,secure:port===465,requireTLS:port!==465,pool:true,maxConnections:5,maxMessages:100,auth:{user:smtp.smtp_user,pass:smtp.smtp_pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},disableFileAccess:true,disableUrlAccess:true});smtpPool.set(key,transport)}
 const result=await transport.sendMail({...mail(input),from:`"${input.fromName.replace(/["\r\n]/g,'')}" <${smtp.from_email||smtp.smtp_user}>`})
 return{messageId:String(result.messageId||'')}
}
