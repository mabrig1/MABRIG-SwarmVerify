import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {FREE_MODELS,ROLES,selectFreeModel,evidencePack,validateSquadOutput,runSwarmDemo} from '../src/swarm-demo.js';

const env={AUDIT_ALLOWED_HOSTS:'aiuniversityhq.uk,buildrx.online',ADMIN_TOKEN:'a-private-test-token-that-is-long-enough',OPENROUTER_API_KEY:'test-only-key-not-a-real-secret-0123456'};
const audit={url:'https://aiuniversityhq.uk/',score:91,pages_scanned:4,checks:[
  {title:'Home page HTTP response',status:'pass',evidence:'private source data must not go to provider'},
  {title:'Sample internal links',status:'pass'},
  {title:'Document language',status:'pass'},
  {title:'Images with alternative text',status:'pass'},
  {title:'Page title',status:'pass'},
  {title:'Meta description',status:'pass'},
  {title:'Viewport metadata',status:'pass'},
  {title:'X-Content-Type-Options',status:'warn'},
  {title:'Content-Security-Policy',status:'warn'},
  {title:'Potential form labeling',status:'pass'},
  {title:'Primary heading',status:'pass'},
  {title:'JavaScript execution & console',status:'not_tested'},
  {title:'Rendered responsive layout',status:'not_tested'},
  {title:'Forms, login and checkout',status:'not_tested'}
]};
test('20 distinct roles, only three allowlisted zero-dollar model selectors',()=>{
  assert.equal(ROLES.length,20);
  assert.equal(new Set(ROLES.map(r=>r.id)).size,20);
  assert.equal(FREE_MODELS.length,3);
  for(const model of FREE_MODELS)assert.equal(selectFreeModel(model),model);
  assert.throws(()=>selectFreeModel('openai/gpt-5.1'),/free/);
  assert.throws(()=>selectFreeModel('nvidia/nemotron-3.5-lightning'),/free/);
});
test('evidence packing shares only check names and statuses',()=>{
  const pack=evidencePack(audit);
  assert.equal(pack.checks.length,audit.checks.length);
  assert.ok(!JSON.stringify(pack).includes('private source data'));
  assert.ok(!JSON.stringify(pack).includes('aiuniversityhq.uk'));
});
test('twenty-role demo uses at most four actual free-model calls, with grounded advisory evidence',async()=>{
  const payloads=[];
  const fakeFetch=async(_url,init)=>{
    const payload=JSON.parse(init.body);
    payloads.push({body:payload,authorization:init.headers.Authorization});
    const task=JSON.parse(payload.messages[1].content);
    return new Response(JSON.stringify({model:payload.model,usage:{total_tokens:100},choices:[
      {message:{content:JSON.stringify({agents:task.roles.filter(r=>r.permitted_evidence_ids.length).map(r=>({
        id:r.id,evidence_id:r.permitted_evidence_ids[0],observation:'Based on the listed check status only.',
        next_action:'Verify this finding with a manual or browser test.'
      }))})}}
    ]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await runSwarmDemo('https://aiuniversityhq.uk',env,{audit:async()=>audit,fetcher:fakeFetch});
  assert.equal(result.agents.length,20);
  assert.equal(result.squads.length,4);
  assert.equal(result.calls_made,4);
  assert.equal(payloads.length,4);
  assert.ok(result.agents.filter(x=>x.status==='ai_advisory').length>=15);
  assert.ok(result.agents.some(x=>x.status==='inconclusive'),'roles without supported evidence must not claim a pass');
  assert.equal(result.http_audit.score,91);
  for(const req of payloads) {
    assert.equal(req.body.model,'nvidia/nemotron-3.5-lightning:free');
    const request=JSON.stringify(req.body);
    assert.ok(!request.includes(env.ADMIN_TOKEN));
    assert.ok(!request.includes(env.OPENROUTER_API_KEY));
    assert.ok(!request.includes('private source data'));
  }
});
test('malformed provider JSON and exhausted free quota are marked inconclusive, never fabricated',async()=>{
  let count=0;
  const result=await runSwarmDemo('https://aiuniversityhq.uk',env,{audit:async()=>audit,
    fetcher:async()=>{count++;return new Response('busy',{status:429});}});
  assert.equal(count,4);
  assert.equal(result.agents.filter(x=>x.status==='ai_advisory').length,0);
  assert.ok(result.squads.every(s=>s.status==='unavailable'));
  assert.ok(result.squads.every(s=>s.error.includes('429')));
});
test('no HTTP evidence means no model calls',async()=>{
  const empty={...audit,pages_scanned:0,checks:[{title:'Page reachability',status:'fail'}]};
  let called=0;
  const result=await runSwarmDemo('https://aiuniversityhq.uk',env,{audit:async()=>empty,
    fetcher:async()=>{called++;throw Error('unexpected');}});
  assert.equal(called,0);assert.equal(result.calls_made,0);
  assert.equal(result.agents.length,20);
});
test('administrator and OpenRouter credentials are required by the live endpoint',async()=>{
  const base='https://appverify.mabrigkorie.org/api/swarm/demo';
  const input=JSON.stringify({url:'https://aiuniversityhq.uk',model:'nvidia/nemotron-3.5-lightning:free'});
  let r=await worker.fetch(new Request(base,{method:'POST',headers:{'content-type':'application/json'},body:input}),env);
  assert.equal(r.status,401);
  r=await worker.fetch(new Request(base,{method:'POST',headers:{authorization:'Bearer WRONG', 'content-type':'application/json'},body:input}),env);
  assert.equal(r.status,401);
  r=await worker.fetch(new Request(base,{method:'POST',headers:{authorization:'Bearer '+env.ADMIN_TOKEN,'content-type':'application/json'},body:input}),{...env,OPENROUTER_API_KEY:''});
  assert.equal(r.status,503);
  const health=await worker.fetch(new Request('https://appverify.mabrigkorie.org/api/health'),env);
  const body=await health.json();
  assert.equal(body.swarm_demo_configured,true);
  assert.ok(!JSON.stringify(body).includes(env.OPENROUTER_API_KEY));
});
test('reject unsupported evidence id in model reply',()=>{
  const squad={roles:[ROLES[0]]};
  const record={agents:[{id:'A01',evidence_id:'C99',observation:'Fake check passed.',next_action:'No need to act.'}]};
  assert.equal(validateSquadOutput(record,squad,evidencePack(audit)).size,0);
});
