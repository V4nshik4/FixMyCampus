const ADMIN_PASS = 'admin123';
let issues = [], filter = 'all', catFilter = 'ALL', pendingId = null;

function getVotes() { try { return JSON.parse(localStorage.getItem('fmc_v')||'{}'); } catch { return {}; } }
function setVote(id, v) { const vs=getVotes(); if(v===0) delete vs[id]; else vs[id]=v; localStorage.setItem('fmc_v', JSON.stringify(vs)); }
function myName() { return localStorage.getItem('fmc_name')||''; }

function needsAttention(i) {
  if (i.status === 'RESOLVED') return false;
  if ((i.support||0) >= 25) return true;
  if (i.createdAt) { if ((Date.now()-new Date(i.createdAt).getTime())/86400000 > 3) return true; }
  return false;
}

const catEmoji = {ELECTRICAL:'⚡',PLUMBING:'🚿',CLEANLINESS:'🧹',INTERNET:'📶',FURNITURE:'🪑',OTHER:'📌'};
function esc(v) { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ageStr(ts) {
  if (!ts) return '';
  const d=Math.floor((Date.now()-new Date(ts).getTime())/86400000);
  const h=Math.floor((Date.now()-new Date(ts).getTime())/3600000);
  return d>0?`${d}d ago`:h>0?`${h}h ago`:'Just now';
}

function sevBar(sev) {
  const cols=['#d1d5db','#86efac','#fbbf24','#f97316','#ef4444'];
  return `<div class="sev-bar">${[1,2,3,4,5].map(n=>`<div class="sev-dot" style="background:${n<=sev?cols[n-1]:'#e5e7eb'}"></div>`).join('')}</div>`;
}

function renderTrending() {
  const el = document.getElementById('trending-list');
  if (!el) return;
  const top = [...issues].filter(i=>i.status!=='RESOLVED').sort((a,b)=>b.priority-a.priority).slice(0,3);
  if (!top.length) { el.closest('.trending').style.display='none'; return; }
  el.closest('.trending').style.display='';
  const medals=['🥇','🥈','🥉'];
  el.innerHTML = top.map((i,idx)=>`
    <div class="trend-card" onclick="document.getElementById('issues').scrollIntoView({behavior:'smooth'})">
      <div class="trend-rank">${medals[idx]}</div>
      <div class="trend-body">
        <h4>${esc(i.title)}</h4>
        <p>${catEmoji[i.category]||'📌'} ${esc(i.category)} · ${esc(i.location)}</p>
      </div>
      <div class="trend-votes"><strong>${i.support||0}</strong><span>votes</span></div>
    </div>`).join('');
}

function render() {
  const resolved = issues.filter(i=>i.status==='RESOLVED').length, total=issues.length;
  document.getElementById('total-count').textContent = total;
  document.getElementById('active-count').textContent = issues.filter(needsAttention).length;
  document.getElementById('resolved-count').textContent = resolved;
  document.getElementById('all-num').textContent = total;

  const pct = total ? Math.round((resolved/total)*100) : 0;
  document.getElementById('res-pct').textContent = pct+'%';
  document.getElementById('res-bar').style.width = pct+'%';

  renderTrending();

  let shown = filter==='all' ? [...issues]
    : filter==='active' ? issues.filter(needsAttention)
    : issues.filter(i=>i.status==='RESOLVED');

  if (catFilter!=='ALL') shown = shown.filter(i=>i.category===catFilter);
  shown.sort((a,b)=>document.getElementById('sort').value==='newest'?b.id-a.id:b.priority-a.priority);

  const grid = document.getElementById('issue-list');
  if (!shown.length) { grid.innerHTML='<div class="empty">No issues here yet.</div>'; return; }

  const votes=getVotes(), me=myName();
  grid.innerHTML = shown.map(i=>{
    const mv=votes[i.id]||0, attn=needsAttention(i), age=ageStr(i.createdAt);
    return `<div class="card${attn?' urgent':''}">
  <div class="card-tags">
    <div style="display:flex;gap:5px;flex-wrap:wrap">
      <span class="tag tag-cat">${catEmoji[i.category]||'📌'} ${esc(i.category)}</span>
      ${attn?`<span class="tag tag-attn">🔥 Urgent</span>`:''}
    </div>
    <span class="tag tag-${esc(i.status)}">${esc(i.status.replace(/_/g,' '))}</span>
  </div>
  <h3>${esc(i.title)}</h3>
  <p class="desc">${esc(i.description)}</p>
  <div class="meta"><span>📍 ${esc(i.location)}</span>${age?`<span>🕐 ${age}</span>`:''}</div>
  <div class="meta" style="align-items:center;gap:8px"><span style="font-size:0.72rem;color:var(--muted)">Severity</span>${sevBar(i.severity)}</div>
  <hr class="divider">
  <div class="card-footer">
    <div class="vote-row">
      <button class="vote-btn${mv===1?' voted':''}" onclick="vote(${i.id},1)">↑ Support</button>
      <span class="vote-score">${i.support||0}</span>
      <button class="vote-btn down${mv===-1?' voted':''}" onclick="vote(${i.id},-1)">↓</button>
    </div>
    ${i.status!=='RESOLVED'
      ?`<button class="resolve-btn" onclick="startResolve(${i.id},'${esc(i.reporterName||'')}')">✓ Resolve</button>`
      :`<span style="font-size:0.75rem;color:var(--green)">✓ Resolved</span>`}
  </div>
</div>`;
  }).join('');
}

async function load() {
  try {
    issues = await (await fetch('/api/issues')).json();
    render();
  } catch {
    document.getElementById('issue-list').innerHTML='<div class="empty">Could not connect. Run run-web.bat first.</div>';
    const tr=document.getElementById('trending-list')?.closest('.trending');
    if(tr) tr.style.display='none';
  }
}

async function vote(id, v) {
  const cur=getVotes()[id]||0, next=cur===v?0:v;
  setVote(id,next);
  await fetch(`/api/issues/${id}/vote`,{method:'PUT',body:new URLSearchParams({vote:next})});
  await load();
}

function startResolve(id, reporter) {
  const me=myName();
  if (me && reporter && me.trim().toLowerCase()===reporter.trim().toLowerCase()) { doResolve(id); return; }
  pendingId=id;
  document.getElementById('admin-pass').value='';
  document.getElementById('admin-msg').textContent='';
  document.getElementById('admin-modal').classList.add('open');
}

async function confirmResolve() {
  const pass=document.getElementById('admin-pass').value, msg=document.getElementById('admin-msg');
  if (pass!==ADMIN_PASS) { msg.textContent='Wrong password.'; msg.className='err'; return; }
  await doResolve(pendingId); closeAdminModal();
}

async function doResolve(id) {
  await fetch(`/api/issues/${id}/status`,{method:'PUT',body:new URLSearchParams({status:'RESOLVED'})});
  await load(); setFilter('RESOLVED');
}

function setFilter(f) {
  filter=f;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter===f));
  render();
}

function openModal() { document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }
function closeAdminModal() { document.getElementById('admin-modal').classList.remove('open'); }

document.getElementById('sort').addEventListener('change', render);
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setFilter(t.dataset.filter)));

document.getElementById('cat-pills').addEventListener('click', e=>{
  const pill=e.target.closest('.pill'); if(!pill) return;
  catFilter=pill.dataset.cat;
  document.querySelectorAll('.pill').forEach(p=>p.classList.toggle('active',p.dataset.cat===catFilter));
  render();
});

document.getElementById('report-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const data=new FormData(e.target), name=(data.get('name')||'').trim();
  if(name) localStorage.setItem('fmc_name',name);
  const msg=document.getElementById('form-msg');
  msg.textContent=''; msg.className='';
  try {
    const res=await fetch('/api/issues',{method:'POST',body:new URLSearchParams(data)});
    const json=await res.json();
    if(res.ok) {
      msg.textContent=`✓ Issue #${json.id} reported!`; msg.className='ok';
      e.target.reset();
      if(name) e.target.querySelector('[name=name]').value=name;
      await load();
      setTimeout(()=>{ closeModal(); setFilter('all'); document.getElementById('issues').scrollIntoView({behavior:'smooth'}); },1200);
    } else { msg.textContent=json.error||'Could not submit.'; msg.className='err'; }
  } catch { msg.textContent='Server error.'; msg.className='err'; }
});

document.addEventListener('keydown', e=>{ if(e.key==='Escape'){closeModal();closeAdminModal();} });
load();
