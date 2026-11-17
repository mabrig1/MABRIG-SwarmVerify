import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{allowedHosts,validateTarget,scoreChecks} from '../src/index.js';
const env={AUDIT_ALLOWED_HOSTS:'aiuniversityhq.uk,buildrx.online'};
test('allowlist is exact and normalizes case',()=>{assert.deepEqual(allowedHosts({AUDIT_ALLOWED_HOSTS:'AIUNIVERSITYHQ.UK, buildrx.online'}),['aiuniversityhq.uk','buildrx.online']);assert.equal(validateTarget('https://aiuniversityhq.uk/',env).hostname,'aiuniversityhq.uk');});
test('rejects SSRF and unsafe navigation',()=>{
 for(const url of ['http://aiuniversityhq.uk','https://127.0.0.1','https://localhost','https://aiuniversityhq.uk.evil.com','https://aiuniversityhq.uk:8080','https://aiuniversityhq.uk@evil.com','https://aiuniversityhq.uk/logout','https://aiuniversityhq.uk/checkout','https://aiuniversityhq.uk/?delete=true']) assert.throws(()=>validateTarget(url,env),url);
});
test('score excludes explicitly untested checks',()=>{assert.equal(scoreChecks([{status:'pass'},{status:'fail'},{status:'warn'},{status:'not_tested'}]),50);assert.equal(scoreChecks([{status:'not_tested'}]),null);});
test('health is public but audits fail closed without secret',async()=>{const req=new Request('https://example.com/api/health');const res=await worker.fetch(req,env);assert.equal(res.status,200);assert.equal((await res.json()).audit_enabled,false);const audit=await worker.fetch(new Request('https://example.com/api/audit',{method:'POST',body:JSON.stringify({url:'https://aiuniversityhq.uk'})}),env);assert.equal(audit.status,503);});
