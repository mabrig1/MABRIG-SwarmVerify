/** MABRIG SwarmVerify Cloud — conservative server-side HTTP/HTML inspection.
 * Not a Chromium test, pentest, accessibility certification, or 50-agent AI swarm.
 */
const BLOCKED = /(?:^|\/)(?:logout|log-out|signout|sign-out|delete|destroy|remove|cancel|checkout|payments?|purchase|subscribe|unsubscribe|admin|api|webhook|auth|session|reset-password|change-password|cart|order|transfer|withdraw|refund)(?:\/|$)/i;
const MAX_HTML_BYTES = 350_000;
const MAX_PAGES = 4;
const REQ_TIMEOUT_MS = 9000;

export function allowedHosts(env) {
  return String(env.AUDIT_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).filter(s => /^(?!-)[a-z\d-]+(?:\.[a-z\d-]+)+$/.test(s));
}
export function validateTarget(value, env) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a complete HTTPS website URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Only standard HTTPS URLs without credentials, ports or fragments are allowed.');
  if (!allowedHosts(env).includes(url.hostname.toLowerCase())) throw new Error('This domain has not been approved by the operator.');
  if (BLOCKED.test(url.pathname) || url.search) throw new Error('Potentially sensitive actions and query parameters are not permitted.');
  return url;
}
export function scoreChecks(checks) {
  const tested = checks.filter(c => c.status !== 'not_tested');
  if (!tested.length) return null;
  const weights = { pass: 1, warn: 0.5, fail: 0 };
  return Math.round(100 * tested.reduce((n, c) => n + (weights[c.status] ?? 0), 0) / tested.length);
}
function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'access-control-allow-origin':'null'}});
}
async function secureEquals(a,b) {
  const encoder = new TextEncoder();
  const [ah,bh] = await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);
  const x = new Uint8Array(ah), y = new Uint8Array(bh);
  let diff = 0;
  for(let i=0;i<x.length;i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function headerCheck(headers,name){return Boolean(headers.get(name));}
async function limitedText(response, limit=MAX_HTML_BYTES) {
  if(!response.body) return {text:'',truncated:false};
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let bytes=0, text='', truncated=false;
  try {
    while(true) {
      const {value,done}=await reader.read(); if(done) break;
      if(bytes+value.byteLength>limit) {text+=decoder.decode(value.slice(0,limit-bytes),{stream:true});truncated=true;break;}
      bytes+=value.byteLength; text+=decoder.decode(value,{stream:true});
    }
  } finally {await reader.cancel().catch(()=>{});}
  return {text:text+decoder.decode(),truncated};
}
async function parseHtml(html,baseUrl) {
  const s={title:'',description:'',lang:'',h1:0,images:0,imagesMissingAlt:0,formFields:0,fieldsMissingLabels:0,buttons:0,buttonsWithoutNames:0,viewport:false,links:[],labelFor:new Set(),fieldIds:[]};
  if (typeof HTMLRewriter === 'undefined') throw new Error('HTML parser not available in this runtime.');
  const parser=new HTMLRewriter()
    .on('html',{element(e){s.lang=e.getAttribute('lang')||'';}})
    .on('title',{text(t){s.title+=t.text;}})
    .on('h1',{element(){s.h1++;}})
    .on('meta',{element(e){const n=(e.getAttribute('name')||'').toLowerCase();if(n==='description')s.description=e.getAttribute('content')||'';if(n==='viewport')s.viewport=true;}})
    .on('img',{element(e){s.images++;if(e.getAttribute('alt')===null)s.imagesMissingAlt++;}})
    .on('input,select,textarea',{element(e){if((e.getAttribute('type')||'').toLowerCase()==='hidden')return;s.formFields++;const id=e.getAttribute('id');if(id)s.fieldIds.push(id);else if(!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby'))s.fieldsMissingLabels++;}})
    .on('label[for]',{element(e){s.labelFor.add(e.getAttribute('for'));}})
    .on('button',{element(e){s.buttons++;if(!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')){ /* text content is not reliably observable without handlers; do not falsely fail */ }}})
    .on('a[href]',{element(e){const href=e.getAttribute('href'); if(!href)return;try{const link=new URL(href,baseUrl);if(link.origin===baseUrl.origin&&!link.search&&!BLOCKED.test(link.pathname)&&link.protocol==='https:')s.links.push(link.href.split('#')[0]);}catch{}}});
  await parser.transform(new Response(html,{headers:{'content-type':'text/html'}})).text();
  for(const id of s.fieldIds) if(!s.labelFor.has(id)) s.fieldsMissingLabels++;
  s.links=[...new Set(s.links)];
  return s;
}
function finding(agent,title,status,evidence,remedy='') {return {agent,title,status,evidence,remedy};}
async function fetchPage(url) {
  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQ_TIMEOUT_MS);
  try {
    const response=await fetch(url.href,{method:'GET',redirect:'manual',signal:controller.signal,headers:{'accept':'text/html'}});
    const contentType=response.headers.get('content-type')||'';
    const result={url:url.href,status:response.status,ms:Date.now()-started,contentType,headers:response.headers,html:'',truncated:false,redirect:response.headers.get('location')};
    if(response.ok&&contentType.toLowerCase().includes('text/html')){const r=await limitedText(response);result.html=r.text;result.truncated=r.truncated;}
    else await response.body?.cancel().catch(()=>{});
    return result;
  } finally {clearTimeout(timer);}
}
export async function runAudit(raw,env) {
  const target=validateTarget(raw,env);
  const start=Date.now(),checks=[],pages=[];
  let first;
  try {first=await fetchPage(target);} catch(error) {
    return {id:crypto.randomUUID(),url:target.href,created_at:new Date().toISOString(),mode:'server-http',duration_ms:Date.now()-start,score:0,pages_scanned:0,pages,checks:[finding('Availability','Page reachability','fail',`Fetch failed: ${String(error.name||'Error')}.`,'Check website status and bot/geo restrictions.'),finding('Browser testing','Interactive browser evaluation','not_tested','Cloudflare HTTP mode has no browser session.')],coverage:'HTTP fetch failed; no page content could be evaluated.'};
  }
  pages.push({url:first.url,status:first.status,duration_ms:first.ms});
  checks.push(finding('Availability','Home page HTTP response',first.status===200?'pass':'fail',`HTTP ${first.status} in ${first.ms} ms.`,first.status===200?'':'Investigate the origin response or redirects.'));
  if(first.redirect) checks.push(finding('Navigation','Redirect encountered','warn','The target returned a redirect. It was not followed for safety.','Audit the final destination separately if it is approved.'));
  if(first.status!==200 || !first.html) {
    checks.push(finding('Accessibility','Page semantic inspection','not_tested','HTML content unavailable.'),finding('Navigation','Internal link checks','not_tested','HTML content unavailable.'));
  } else {
    const d=await parseHtml(first.html,target);
    checks.push(finding('Accessibility','Document language',d.lang?'pass':'warn',d.lang?`HTML lang=${d.lang}`:'<html> has no lang attribute.','Set the document language.'));
    checks.push(finding('Accessibility','Images with alternative text',d.imagesMissingAlt===0?'pass':'warn',`${d.images-d.imagesMissingAlt}/${d.images} images have an alt attribute.`, 'Supply suitable alt text, or alt="" for decorative images.'));
    checks.push(finding('Accessibility','Potential form labeling',d.fieldsMissingLabels===0?'pass':'warn',`${d.fieldsMissingLabels} of ${d.formFields} controls lacked an explicit label association; nested labels may be misclassified.`,'Manually confirm accessible names and label associations.'));
    checks.push(finding('Structure','Primary heading',d.h1===1?'pass':'warn',`${d.h1} H1 elements detected.`, 'Use a clear primary heading.'));
    checks.push(finding('Metadata','Page title',d.title.trim()?'pass':'warn',d.title.trim()?`Title: ${d.title.trim().slice(0,100)}`:'No HTML title detected.','Add a descriptive title.'));
    checks.push(finding('Metadata','Meta description',d.description.trim()?'pass':'warn',d.description.trim()?`Description present (${d.description.length} characters).`:'No description metadata found.','Add a meaningful meta description.'));
    checks.push(finding('Mobile signal','Viewport metadata',d.viewport?'pass':'warn',d.viewport?'Viewport meta tag present.':'Viewport meta tag missing.','Set a suitable viewport meta tag.'));
    if(first.truncated) checks.push(finding('Coverage','Large page truncated','warn','Only the first 350 KB of HTML was analyzed.','Audit using the full browser engine for complete coverage.'));
    const links=d.links.filter(h=>h!==target.href).slice(0,MAX_PAGES-1);
    for(const link of links) {
      try {const r=await fetchPage(new URL(link));pages.push({url:r.url,status:r.status,duration_ms:r.ms});}
      catch(error){pages.push({url:link,status:0,error:String(error.name||'Error')});}
    }
    if(links.length) checks.push(finding('Navigation','Sample internal links',pages.slice(1).every(p=>p.status===200)?'pass':'warn',`${pages.slice(1).filter(p=>p.status===200).length}/${links.length} sampled links returned HTTP 200.`,`Review non-200 links and test all user journeys in a browser.`));
    else checks.push(finding('Navigation','Sample internal links','not_tested','No safe same-domain links were found for sampling.'));
  }
  const h=first.headers;
  checks.push(finding('Headers','X-Content-Type-Options',headerCheck(h,'x-content-type-options')?'pass':'warn',headerCheck(h,'x-content-type-options')?'Header present.':'Header absent on entry response.','Consider nosniff.'));
  checks.push(finding('Headers','Content-Security-Policy',headerCheck(h,'content-security-policy')?'pass':'warn',headerCheck(h,'content-security-policy')?'CSP header present.':'No CSP header detected.','Consider a restrictive, tested CSP.'));
  checks.push(finding('Browser testing','JavaScript execution & console','not_tested','No browser automation runs in Cloudflare HTTP mode.'));
  checks.push(finding('Mobile testing','Rendered responsive layout','not_tested','A viewport tag is checked, but actual mobile layout is not rendered.'));
  checks.push(finding('Functional testing','Forms, login and checkout','not_tested','Forms are not submitted; login and payments are not tested.'));
  return {id:crypto.randomUUID(),url:target.href,created_at:new Date().toISOString(),mode:'server-http',duration_ms:Date.now()-start,score:scoreChecks(checks),pages_scanned:pages.length,pages,checks,coverage:`Read-only HTTPS/HTML signals across ${pages.length} page(s). No JavaScript execution, screenshots, device simulation, login, payments or security penetration testing.`};
}
export default {
  async fetch(request, env) {
    const path=new URL(request.url).pathname;
    if(path==='/api/health' && request.method==='GET') return json({status:'ok',version:'0.2.0-cloud',mode:'server-http',audit_enabled:typeof env.ADMIN_TOKEN==='string'&&env.ADMIN_TOKEN.length>=20,allowed_hosts:allowedHosts(env)});
    if(path==='/api/audit' && request.method==='POST') {
      if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<20) return json({error:'Cloud administrator must set an ADMIN_TOKEN encrypted secret before real audits.'},503);
      const bearer=request.headers.get('authorization')||'';
      if(!bearer.startsWith('Bearer ')||!(await secureEquals(bearer.slice(7),env.ADMIN_TOKEN))) return json({error:'Invalid administrator token.'},401);
      if(Number(request.headers.get('content-length')||0)>4096) return json({error:'Request too large.'},413);
      let input;try{input=await request.json();}catch{return json({error:'Invalid JSON request.'},400);}
      if(typeof input.url!=='string'||input.url.length>500) return json({error:'Provide a valid URL of at most 500 characters.'},422);
      try{return json(await runAudit(input.url,env));}catch(e){return json({error:String(e.message||'Scan failed.').slice(0,180)},422);}
    }
    if(path.startsWith('/api/')) return json({error:'Not found.'},404);
    return env.ASSETS.fetch(request);
  }
};
