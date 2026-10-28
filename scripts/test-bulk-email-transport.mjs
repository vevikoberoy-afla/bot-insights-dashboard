import assert from 'node:assert/strict'
import {classifyBulkEmailTransportError as classify} from '../src/lib/email/transportErrors.ts'

assert.deepEqual(classify({name:'ThrottlingException',$metadata:{httpStatusCode:429},message:'rate'}),{outcome:'failed',retryable:true,code:'ThrottlingException',message:'rate'})
assert.equal(classify({name:'InvalidParameterValueException',$metadata:{httpStatusCode:400}}).outcome,'failed')
assert.equal(classify({code:'ENOTFOUND'}).outcome,'failed')
assert.equal(classify({code:'ECONNREFUSED'}).retryable,true)
assert.equal(classify({responseCode:450}).retryable,true)
assert.equal(classify({responseCode:550}).retryable,false)
assert.equal(classify({code:'ECONNRESET'}).outcome,'unknown')
assert.equal(classify({code:'EPIPE'}).outcome,'unknown')
assert.equal(classify({name:'TimeoutError'}).outcome,'unknown')
assert.equal(classify(new Error('unclassified transport failure')).outcome,'unknown')
console.log('PASS: SES/SMTP definite rejection, retryable throttle, and ambiguous socket-loss classification')
