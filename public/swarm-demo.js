(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {result:null};
  function status(message,bad=false) {
    const el=$('swarm-feedback');
    el.textContent=message;el.classList.toggle('bad',bad);
  }
  function textNode(tag,className,value) {
    const el=document.createElement(tag);
    if(className)el.className=className;
    el.textContent=String(value??'');
    return el;
  }
  function render(data) {
    state.result=data;
    $('swarm-results').classList.remove('hidden');
    $('swarm-run-count').textContent=String(data.agents?.length||0);
    $('swarm-ai-count').textContent=String((data.agents||[]).filter(x=>x.status==='ai_advisory').length);
    $('swarm-calls').textContent=String(data.calls_made??0);
    $('swarm-http-score').textContent=data.http_audit?.score===null?'N/A':String(data.http_audit?.score??'—')+'%';
    $('swarm-explanation').textContent=data.disclaimer||'Advisory demonstration; no browser actions.';
    const squads=$('swarm-squads');squads.replaceChildren();
    for(const s of data.squads||[]) {
      const div=textNode('div','swarm-squad'+(s.status==='unavailable'?' error':''),s.id+' · '+s.name+' · '+s.status+(s.error?' · '+s.error:''));
      squads.append(div);
    }
    const cards=$('swarm-cards');cards.replaceChildren();
    for(const a of data.agents||[]) {
      const card=textNode('article','swarm-card','');
      const header=document.createElement('header');
      const h=textNode('div','','');
      h.append(textNode('div','swarm-id',a.id),textNode('h3','',a.name));
      header.append(h,textNode('span','swarm-chip '+a.status,a.status==='ai_advisory'?'AI advice':'Unverified'));
      card.append(header,textNode('p','swarm-reason',a.observation),
        textNode('p','swarm-action','Next: '+a.next_action));
      if(a.evidence_id)card.append(textNode('span','swarm-chip','Evidence '+a.evidence_id));
      cards.append(card);
    }
    $('swarm-export').disabled=false;
    status('Finished: '+(data.agents||[]).filter(x=>x.status==='ai_advisory').length+
      '/20 roles produced evidence-referenced AI advisories. Inconclusive roles were not counted as passes.');
  }
  async function setup() {
    try {
      const res=await fetch('/api/health',{cache:'no-store'});
      if(!res.ok)throw new Error('Health endpoint unavailable');
      const h=await res.json();
      const ready=Boolean(h.audit_enabled && h.swarm_demo_configured);
      $('swarm-ready').textContent=ready?'Configured for AI calls':'Needs Cloudflare secret configuration';
      $('swarm-ready').className=ready?'online':'muted';
      $('swarm-allowlist').textContent='Approved targets: '+(h.allowed_hosts||[]).join(', ');
      if(!ready) status('OPENROUTER_API_KEY and ADMIN_TOKEN must be encrypted Cloudflare Worker secrets. Do not paste a key into the site.',true);
    } catch {
      status('Could not check the server configuration. Verify the deployment and try again.',true);
    }
  }
  async function start() {
    const button=$('swarm-launch'),token=$('swarm-token').value.trim();
    const url=$('swarm-url').value.trim(),model=$('swarm-model').value;
    button.disabled=true;
    $('swarm-results').classList.add('hidden');
    status('Coordinating four small AI batches over 20 specialized roles; free model responses may take time.');
    try {
      const response=await fetch('/api/swarm/demo',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({url,model})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'The demonstration request failed.');
      render(body);
    }catch(err){status(err?.message||'The demonstration could not complete.',true);}
    finally{
      $('swarm-token').value='';button.disabled=false;
    }
  }
  function exportEvidence() {
    if(!state.result)return;
    const blob=new Blob([JSON.stringify(state.result,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='swarmverify-20-role-'+state.result.id+'.json';a.click();
    URL.revokeObjectURL(url);
  }
  $('swarm-launch')?.addEventListener('click',start);
  $('swarm-export')?.addEventListener('click',exportEvidence);
  setup();
})();