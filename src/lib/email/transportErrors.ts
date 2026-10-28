export type TransportFailure={outcome:'failed'|'unknown';retryable:boolean;code:string;message:string}

const retryableNames=new Set(['ThrottlingException','TooManyRequestsException','ServiceUnavailableException','InternalServerError','RequestTimeout','RequestTimeoutException'])
const definiteNames=new Set(['InvalidParameterValue','InvalidParameterValueException','MailFromDomainNotVerifiedException','MessageRejected','AccountSendingPausedException','AccessDeniedException'])
const preAcceptanceCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH'])
const ambiguousCodes=new Set(['ECONNRESET','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'])

function value(error:any,key:string){let current=error;for(let depth=0;current&&depth<4;depth++,current=current.cause){if(current[key]!==undefined)return current[key]}return undefined}

/** Classifies only what can be proven from provider/network metadata. Unknown defaults to duplicate-safe ambiguity. */
export function classifyBulkEmailTransportError(error:unknown):TransportFailure{
 const source=error as any,name=String(value(source,'name')||'TransportError'),code=String(value(source,'code')||name),status=Number(value(source,'$metadata')?.httpStatusCode||value(source,'statusCode')||value(source,'status')||0),smtp=Number(value(source,'responseCode')||0),message=String(value(source,'message')||'Email provider delivery failed').slice(0,500)
 if(status>=400)return{outcome:'failed',retryable:status===429||status>=500||retryableNames.has(name),code,message}
 if(smtp>=400)return{outcome:'failed',retryable:smtp>=400&&smtp<500,code,message}
 if(retryableNames.has(name))return{outcome:'failed',retryable:true,code,message}
 if(definiteNames.has(name))return{outcome:'failed',retryable:false,code,message}
 if(preAcceptanceCodes.has(code))return{outcome:'failed',retryable:true,code,message}
 if(ambiguousCodes.has(code)||name==='TimeoutError')return{outcome:'unknown',retryable:false,code,message}
 return{outcome:'unknown',retryable:false,code,message}
}
