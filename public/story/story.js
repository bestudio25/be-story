(() => {
'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const DATA = JSON.parse(document.getElementById('story-data').textContent);
const MEDIA = DATA.media || {};
const M = k => !k ? '' : (Object.prototype.hasOwnProperty.call(MEDIA,k) ? (MEDIA[k]||'') : (/^(\/|https?:|data:|blob:)/.test(k) ? k : ''));
const API = '/api/e/' + encodeURIComponent(DATA.event.slug);
const post = (path, body, method='POST') => fetch(API+path, {method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}), keepalive: true, credentials:'same-origin'}).then(r=>r.ok?r.json().catch(()=>({})):Promise.reject(r)).catch(e=>{ throw e; });
const track = (kind, extra={}) => { if(DATA.preview) return; post('/track', {kind, ...extra}).catch(()=>{}); };
const isMobile = matchMedia('(max-width: 900px)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EV = DATA.event, FILES = DATA.files, CH = DATA.chapters;
const store = {
  get(k, d){ try{ const v = localStorage.getItem('bestory:'+EV.slug+':'+k); return v===null? d : JSON.parse(v);}catch{return d} },
  set(k, v){ try{ localStorage.setItem('bestory:'+EV.slug+':'+k, JSON.stringify(v)); }catch{} }
};

// imagens
$$('[data-src]').forEach(el => el.src = M(el.dataset.src));
// texturas
const noise = (() => { const c=document.createElement('canvas'); c.width=c.height=160; const x=c.getContext('2d'); const d=x.createImageData(160,160);
  for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255; d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255;} x.putImageData(d,0,0); return c.toDataURL(); })();
const paper = (() => { const c=document.createElement('canvas'); c.width=c.height=220; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,220,220);
  for(let i=0;i<5000;i++){x.fillStyle=`rgba(120,100,80,${Math.random()*.06})`; x.fillRect(Math.random()*220,Math.random()*220,Math.random()*2+.5,Math.random()*2+.5);} return c.toDataURL(); })();
document.documentElement.style.setProperty('--noise', `url(${noise})`);
document.documentElement.style.setProperty('--paper', `url(${paper})`);

// ── utilidades ──
const fmtBytes = b => !b ? '' : b>=1e9 ? (b/1e9).toLocaleString('pt-BR',{maximumFractionDigits:1})+' GB' : b>=1e6 ? Math.round(b/1e6)+' MB' : Math.round(b/1e3)+' KB';
const fmtDur = s => !s ? 'vídeo' : `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
// Horários das fotos não são exibidos (vídeos exportados trazem a hora da exportação, não da gravação)
const fmtTime = () => '';
const dateLong = d => new Date(d+'T12:00:00-03:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
const dateShort = d => { const [y,m,dd]=d.split('-'); return `${dd}.${m}.${y.slice(2)}`; };
let toastT; const toast = msg => { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2600); };
const vibrate = p => { try{ navigator.vibrate && navigator.vibrate(p); }catch{} };

let audioOn = false;
// ── Trilha sonora do evento (enviada no painel) ──
const music = M('soundtrack') ? Object.assign(new Audio(M('soundtrack')), { preload:'auto', volume:0 }) : null;
const MUSIC_START = Math.max(0, parseFloat(MEDIA['soundtrack-start'] || '0') || 0);
let musicStarted = false;
if(music){ // começa no trecho escolhido no painel e, ao terminar, volta para esse mesmo trecho
  music.addEventListener('ended', ()=>{ music.currentTime = MUSIC_START; music.play().catch(()=>{}); });
}
let musicMuted = false, ducked = false, fadeT;
function fadeTo(v, ms=900){ if(!music) return; clearInterval(fadeT); const from=music.volume, t0=performance.now();
  fadeT=setInterval(()=>{ const p=Math.min(1,(performance.now()-t0)/ms); music.volume=Math.max(0,Math.min(1,from+(v-from)*p)); if(p>=1){ clearInterval(fadeT); if(v===0) music.pause(); } },40); }
function musicPlay(){ if(!music||musicMuted||ducked) return; if(!musicStarted){ musicStarted=true; const seek=()=>{ try{ music.currentTime = MUSIC_START; }catch{} }; if(music.readyState>=1) seek(); else music.addEventListener('loadedmetadata', seek, { once:true }); } music.play().then(()=>fadeTo(.55)).catch(()=>{}); }
function musicStop(){ if(music && !music.paused) fadeTo(0,500); }
function syncSoundIcons(){ const on = music ? (!musicMuted) : audioOn;
  ['#op-sound','#sound-btn'].forEach(sel=>{ const b=$(sel); if(!b) return; b.setAttribute('aria-pressed',on); b.setAttribute('aria-label', on?'Silenciar':'Ativar som'); b.querySelector('use').setAttribute('href', on?'#i-sound':'#i-mute'); }); }
let audioOnTouched=false;
function toggleSound(){
  audioOnTouched=true;
  if(music){ musicMuted = !musicMuted; audioOn=!musicMuted; if(musicMuted) musicStop(); else musicPlay(); }
  syncSoundIcons();
}
if(music) $('#op-sound').addEventListener('click', toggleSound); else $('#op-sound').hidden=true;
if(music){ const sb=$('#sound-btn'); sb.hidden=false; sb.addEventListener('click', toggleSound); musicMuted=true; syncSoundIcons();
  // vídeos do site pausam a trilha; ela volta quando o vídeo para
  const playing=new Set();
  document.addEventListener('play', e=>{ if(e.target instanceof HTMLVideoElement && !e.target.muted){ playing.add(e.target); ducked=true; musicStop(); } }, true);
  const off=e=>{ if(e.target instanceof HTMLVideoElement){ playing.delete(e.target); if(!playing.size){ ducked=false; setTimeout(musicPlay,300); } } };
  document.addEventListener('pause', off, true); document.addEventListener('ended', off, true);
  document.addEventListener('volumechange', e=>{ const v=e.target; if(v instanceof HTMLVideoElement && !v.paused){ if(v.muted) off({target:v}); else { playing.add(v); ducked=true; musicStop(); } } }, true);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) musicStop(); else musicPlay(); });
}

// ═════════ ABERTURA POLAROID ═════════
const pol=$('#pol'), polImg=$('#pol-img'), dev=$('#pol-dev'), hand=$('#pol-hand');
hand.textContent = EV.clientNames; $('#pol-date').textContent = dateShort(EV.eventDate);
let progress=0, done=false, last=performance.now(), lastShake=0;
const AUTO = 1/6; // revela sozinha em ~6s
function paintReveal(p){
  const e = p<.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2; // ease
  polImg.style.filter = `brightness(${.35+.65*e}) contrast(${.45+.55*e}) saturate(${e}) sepia(${.55*(1-e)}) hue-rotate(${-25*(1-e)}deg) blur(${(1-e)*2.5}px)`;
  const r = 140 - e*150; // das bordas para o centro
  const m = `radial-gradient(closest-side, #000 ${Math.max(r-35,-10)}%, transparent ${Math.max(r+5,0)}%)`;
  dev.style.webkitMaskImage = m; dev.style.maskImage = m; dev.style.opacity = Math.min(1, 1.25-e);
  $('#op-bar').style.width = (p*100)+'%';
}
document.fonts && document.fonts.ready.then(()=>{ try{ fitHand($('#pol-hand')); const fh=$('#fim-hand'); if(fh&&fh.classList.contains('write')) fitHand(fh); }catch{} });
function fitHand(t){ try{ let fs=50; t.style.fontSize=fs+'px'; while(t.getComputedTextLength()>300 && fs>18){ fs-=2; t.style.fontSize=fs+'px'; } }catch{} }
function boost(v){ if(done) return; progress=Math.min(1,progress+v); }
function tick(now){
  if(done) return;
  const dt=(now-last)/1000; last=now; progress=Math.min(1, progress+dt*AUTO); paintReveal(progress);
  if(progress>=1) return finishReveal();
  requestAnimationFrame(tick);
}
function finishReveal(){
  done=true; paintReveal(1); dev.style.opacity=0; vibrate([18,40,18]);
  $('#op-hint').style.opacity=0;
  fitHand(hand); hand.classList.add('write'); setTimeout(()=>$('#pol-date').classList.add('in'), reduce?0:400);
  $('#op-letter').classList.add('show'); const lines=$$('#op-letter .l'); lines.forEach((l,i)=>setTimeout(()=>l.classList.add('in'), reduce?0:1700+i*650));
  if(matchMedia('(max-width:899px)').matches){ const op=$('#opening'), L=$('#op-letter'), beh=reduce?'auto':'smooth';
    setTimeout(()=>op.scrollTo({top:Math.max(0,L.offsetTop-innerHeight*.45),behavior:beh}), reduce?0:1500);
    setTimeout(()=>op.scrollTo({top:Math.max(0,L.offsetTop+L.offsetHeight-innerHeight+40),behavior:beh}), reduce?0:1700+lines.length*650); }
  store.set('revealed', true); track('reveal');
  // pré-carrega o vídeo do hero
  
}
// gestos: esfregar o dedo / arrastar o mouse
let pdown=false, lx=0, ly=0;
pol.addEventListener('pointerdown', e=>{ pdown=true; lx=e.clientX; ly=e.clientY; askMotion(); boost(.04); });
addEventListener('pointerup', ()=>pdown=false);
pol.addEventListener('pointermove', e=>{ const d=Math.hypot(e.clientX-lx,e.clientY-ly); lx=e.clientX; ly=e.clientY;
  if(pdown || e.pointerType==='mouse') boost(Math.min(d,40)/ (e.pointerType==='mouse'&&!pdown ? 2600 : 900)); });
pol.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); boost(.2);} });
pol.tabIndex=0;
// balançar o celular
let motionAsked=false;
function onMotion(e){ const a=e.acceleration||e.accelerationIncludingGravity; if(!a) return; const m=Math.abs(a.x||0)+Math.abs(a.y||0)+Math.abs(a.z||0);
  const thr = e.acceleration ? 14 : 30; const now=performance.now(); if(m>thr && now-lastShake>120){ lastShake=now; boost(.09); pol.animate([{transform:'rotate(var(--rot)) translateX(0)'},{transform:'rotate(var(--rot)) translateX(-4px)'},{transform:'rotate(var(--rot)) translateX(4px)'},{transform:'rotate(var(--rot))'}],{duration:180}); } }
function askMotion(){ if(motionAsked) return; motionAsked=true;
  if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function'){
    DeviceMotionEvent.requestPermission().then(s=>{ if(s==='granted') addEventListener('devicemotion',onMotion); }).catch(()=>{});
  } }
if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission!=='function') addEventListener('devicemotion', onMotion);

function startOpening(){
  const revealed = store.get('revealed', false);
  if(reduce || revealed){
    pol.classList.remove('eject'); pol.style.opacity=0; pol.animate([{opacity:0},{opacity:1}],{duration:reduce?1:700,fill:'forwards'});
    progress=1; finishReveal(); if(revealed){ $('#op-skip').hidden=false; }
  } else {
    setTimeout(()=>{ last=performance.now(); requestAnimationFrame(tick); }, 1300);
  }
}
$('#op-skip').addEventListener('click', ()=>enterSite(false));
$('#op-go').addEventListener('click', ()=>enterSite(true));

function enterSite(animate){
  // entrar na história é um toque do visitante: a trilha começa aqui (se ele não silenciou)
  if(music && !(musicMuted && audioOnTouched)){ musicMuted=false; audioOn=true; musicPlay(); syncSoundIcons(); }
  const op=$('#opening');
  const go = () => { op.classList.add('gone'); document.body.classList.remove('lock'); $('#site').removeAttribute('aria-hidden'); setTimeout(()=>op.hidden=true,900); startHero(); };
  if(!animate || reduce){ go(); return; }
  // a Polaroid cresce, a moldura se dissolve e a foto vira o fundo do hero
  const r = $('#pol-photo').getBoundingClientRect(); const fl=$('#flip'); $('#flip-img').src=polImg.src;
  Object.assign(fl.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:'0px'}); fl.hidden=false;
  pol.style.transition='opacity .6s'; pol.style.opacity=0; $('#op-letter').style.transition='opacity .5s, filter .5s'; $('#op-letter').style.opacity=0; $('#op-letter').style.filter='blur(6px)';
  const anim = fl.animate([
    {left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',transform:'rotate(-2.5deg)'},
    {left:'0px',top:'0px',width:innerWidth+'px',height:innerHeight+'px',transform:'rotate(0deg)'}
  ],{duration:1250,easing:'cubic-bezier(.7,0,.2,1)',fill:'forwards'});
  scrollTo(0,0);
  anim.onfinish = () => { go(); setTimeout(()=>{ fl.animate([{opacity:1},{opacity:0}],{duration:1400,fill:'forwards'}).onfinish=()=>{fl.hidden=true;}; }, 200); };
}

// ═════════ HERO ═════════
$('#hero-names').innerHTML = EV.clientNames.replace('&','<em>&amp;</em>');
$('#hero-date').textContent = dateLong(EV.eventDate);
$('#hero-place').textContent = EV.location;
(function counter(){
  const day=86400000, ev=new Date(EV.eventDate+'T12:00:00-03:00'), now=new Date();
  const since=Math.floor((now-ev)/day); const ann=new Date(ev); ann.setFullYear(ev.getFullYear()+Math.max(1, Math.ceil((now-ev)/(365.25*day)) || 1));
  const until=Math.ceil((ann-now)/day); const yrs=ann.getFullYear()-ev.getFullYear();
  let txt;
  if(since<0) txt=`Faltam <b>${-since}</b> dias para o grande dia`;
  else if(since===0) txt=`Foi <b>hoje</b>. Que dia!`;
  else txt=`Seu dia foi há <b>${since}</b> ${since===1?'dia':'dias'} · faltam <b>${until}</b> para ${yrs===1?'1 ano':yrs+' anos'}`;
  $('#counter').innerHTML = '<span aria-hidden="true">🤎</span> '+txt;
})();
function heroSlides(){
  if(heroSlides.done) return; heroSlides.done=true;
  const keys=(DATA.heroSlides||[]).filter(k=>M(k)); if(keys.length<2 || reduce) return;
  const bg=$('#hero-bg'); keys.forEach(k=>{ const im=new Image(); im.className='slide'; im.alt=''; im.decoding='async'; im.dataset.k=k; bg.appendChild(im); });
  const sl=$$('#hero-bg .slide'); let i=0;
  const load=n=>{ const im=sl[n]; if(im && !im.src) im.src=M(im.dataset.k); }; load(1);
  setInterval(()=>{ if(document.hidden || scrollY>innerHeight) return; const n=(i+1)%sl.length; load(n); load((n+1)%sl.length);
    sl[n].classList.remove('on'); void sl[n].offsetWidth; sl[n].classList.add('on'); sl[i].classList.remove('on'); i=n; }, 5200);
}
function startHero(){
  if(startHero.done) return; startHero.done=true;
  heroSlides();
  $$('#hero .reveal-up').forEach((el,i)=>setTimeout(()=>el.classList.add('in'), 300+i*180));
  particles();
}
function particles(){
  if(reduce) return; const c=$('#particles'), x=c.getContext('2d'); let w,h; const dpr=Math.min(devicePixelRatio||1,2);
  const size=()=>{ w=c.width=c.offsetWidth*dpr; h=c.height=c.offsetHeight*dpr; }; size(); addEventListener('resize',size);
  const P=Array.from({length:36},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.8+.4,s:Math.random()*.00025+.00008,a:Math.random()*.5+.15,p:Math.random()*6}));
  (function loop(t){ x.clearRect(0,0,w,h); for(const p of P){ p.y-=p.s; if(p.y<-.05){p.y=1.05;p.x=Math.random();} const tw=.6+.4*Math.sin(t/900+p.p);
    const g=x.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,p.r*6*dpr); g.addColorStop(0,`rgba(255,228,190,${p.a*tw})`); g.addColorStop(1,'rgba(255,228,190,0)');
    x.fillStyle=g; x.beginPath(); x.arc(p.x*w,p.y*h,p.r*6*dpr,0,7); x.fill(); } requestAnimationFrame(loop); })(0);
}
// filme
function openModal(id){ $(id).classList.add('open'); document.body.classList.add('lock'); }
function closeModal(el){ el.classList.remove('open'); if(!$('#viewer.open')&&!$('#polgen.open')) document.body.classList.remove('lock'); const v=el.querySelector('video'); if(v) v.pause(); }
$$('.modal').forEach(m=>{ m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('[data-close]')) closeModal(m); }); });
$('#watch-film').addEventListener('click', ()=>{ track('film'); const v=$('#film-video'); if(!v.src){ v.src=M('film'); watchTrack(v,null); } openModal('#film'); v.play().catch(()=>{}); if(v.requestFullscreen && matchMedia('(max-width:700px)').matches) v.requestFullscreen().catch(()=>{}); });

// topbar
const tb=$('#topbar'); addEventListener('scroll', ()=>tb.classList.toggle('show', scrollY > innerHeight*.75), {passive:true});

// reveal ao rolar
const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }),{rootMargin:'0px 0px -8% 0px'});
$$('main section:not(#hero) .reveal-up').forEach(el=>io.observe(el));

// ═════════ FAVORITOS ═════════
let favs = new Set(DATA.favorites && DATA.favorites.length ? DATA.favorites : store.get('favs', []));
function toggleFav(id, btn){
  favs.has(id)? favs.delete(id) : favs.add(id); store.set('favs',[...favs]); post('/fav',{fileId:id,on:favs.has(id)}).catch(()=>{});
  const on=favs.has(id); vibrate(10);
  $$(`.fav[data-id="${id}"]`).forEach(b=>b.setAttribute('aria-pressed',on));
  if(btn){ btn.setAttribute('aria-pressed',on); if(on){ const r=btn.getBoundingClientRect(); burst('🤎', r.left+r.width/2-10, r.top); } }
  updateFavUI(); if(state.filter==='fav') renderGrid(true);
}
function burst(ch,x,y){ const s=document.createElement('span'); s.className='burst'; s.textContent=ch; s.style.left=x+'px'; s.style.top=y+'px'; document.body.appendChild(s); setTimeout(()=>s.remove(),1000); }
function updateFavUI(){
  $('#fav-count').textContent=favs.size; $('#c-fav').textContent=favs.size||'';
  const fb=FILES.filter(f=>favs.has(f.id)).reduce((s,f)=>s+f.size,0);
  $$('[data-zip="fav"]').forEach(b=>b.disabled=!favs.size); $$('[data-zip="fav"]').forEach(b=>b.style.opacity=favs.size?1:.45);
}
$('#fav-jump').addEventListener('click',()=>{ const b=$('[data-filter="fav"]'); if(b) b.click(); $('#galeria').scrollIntoView({behavior:reduce?'auto':'smooth'}); });

// ═════════ CAPÍTULOS ═════════
const tops = CH.filter(c=>!c.parentId).sort((a,b)=>a.position-b.position);
const descendants = id => { const s=new Set([id]); let added=true; while(added){added=false; for(const c of CH) if(c.parentId&&s.has(c.parentId)&&!s.has(c.id)){s.add(c.id);added=true;} } return s; };
const filesIn = id => { const s=descendants(id); return FILES.filter(f=>s.has(f.chapterId)); };
$('#chap-rail').innerHTML = tops.map((c,i)=>{ const fs=filesIn(c.id); const t=fs.map(f=>f.recordedAt).sort();
  return `<button class="chap" data-chapter="${c.id}" aria-label="Capítulo ${i+1}: ${c.name}, ${fs.length} arquivos">
    <div class="media"><img loading="lazy" src="${M(c.cover)}" alt="">${c.preview?`<video muted loop playsinline preload="none" data-src="${c.preview}"></video>`:''}
      <span class="num">Capítulo ${String(i+1).padStart(2,'0')}</span><span class="time">${t.length?fmtTime(t[0]):''}</span><span class="count">${fs.length} arquivos</span></div>
    <h3>${c.name}</h3><p>${c.description||''}</p></button>`; }).join('');
$$('.chap').forEach(el=>{
  const v=el.querySelector('video'); const play=()=>{ if(!v) return; if(!v.src) v.src=M(v.dataset.src); v.play().then(()=>el.classList.add('playing')).catch(()=>{}); };
  const stop=()=>{ if(!v) return; v.pause(); el.classList.remove('playing'); };
  el.addEventListener('mouseenter',play); el.addEventListener('mouseleave',stop); el.addEventListener('focus',play); el.addEventListener('blur',stop);
  el.addEventListener('click',()=>{ openFolder(el.dataset.chapter); $('#galeria').scrollIntoView({behavior:reduce?'auto':'smooth'}); });
});
// no celular: o capítulo centralizado toca a prévia muda
if(matchMedia('(hover:none)').matches){
  const cio=new IntersectionObserver(es=>es.forEach(e=>{ const v=e.target.querySelector('video'); if(!v) return; if(e.intersectionRatio>.8){ if(!v.src) v.src=M(v.dataset.src); v.play().then(()=>e.target.classList.add('playing')).catch(()=>{});} else { v.pause(); e.target.classList.remove('playing'); } }),{threshold:[0,.8,1]});
  $$('.chap').forEach(el=>cio.observe(el));
}
function railProgress(){ const r=$('#chap-rail'); const p=r.scrollLeft/(r.scrollWidth-r.clientWidth||1); $('#chap-prog').style.width=(20+p*80)+'%'; }
$('#chap-rail').addEventListener('scroll',railProgress,{passive:true});
$$('[data-rail]').forEach(b=>b.addEventListener('click',()=>{ const r=$('#'+b.dataset.rail); r.scrollBy({left:+b.dataset.dir*r.clientWidth*.8,behavior:'smooth'}); }));

// ═════════ DESTAQUES ═════════
const HL = FILES.filter(f=>f.highlight);
$('#hl-rail').innerHTML = HL.map(f=>`<button class="hl" data-open="${f.id}" aria-label="${f.name}">
  <div class="ph"><img loading="lazy" src="${M(f.thumb)}" alt="">${f.kind==='video'?`<span class="badge"><svg class="icon"><use href="#i-play"/></svg>${fmtDur(f.duration)}</span>`:''}</div>
  </button>`).join('');
function chapterName(id){ let c=CH.find(x=>x.id===id); while(c&&c.parentId) c=CH.find(x=>x.id===c.parentId); return c?c.name:''; }

// ═════════ GALERIA ═════════
const state = { folder:null, filter:'all', q:'', sort:'asc', shown:0, list:[] };
const PAGE=12;
function openFolder(id){ state.folder=id; renderGrid(true); }
function currentList(){
  let l = state.folder ? filesIn(state.folder) : FILES.slice();
  const counts={all:l.length, video:l.filter(f=>f.kind==='video').length, foto:l.filter(f=>f.kind==='foto').length};
  $('#c-all').textContent=counts.all; $('#c-video').textContent=counts.video; $('#c-foto').textContent=counts.foto;
  if(state.filter==='video'||state.filter==='foto') l=l.filter(f=>f.kind===state.filter);
  if(state.filter==='fav') l=l.filter(f=>favs.has(f.id));
  const q=state.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(q){ const n=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); l=l.filter(f=>n(f.name).includes(q)||f.tags.some(t=>n(t).includes(q))||n(chapterName(f.chapterId)).includes(q)); }
  l.sort((a,b)=> state.sort==='asc' ? a.order-b.order : b.order-a.order);
  return l;
}
function renderCrumbs(){
  const path=[]; let c=state.folder&&CH.find(x=>x.id===state.folder); while(c){ path.unshift(c); c=c.parentId&&CH.find(x=>x.id===c.parentId); }
  const parts=[`<button data-folder="" class="${path.length?'':'cur'}">Todos os capítulos</button>`].concat(path.map((p,i)=>`<span class="sep">/</span><button data-folder="${p.id}" class="${i===path.length-1?'cur':''}">${p.name}</button>`));
  $('#crumbs').innerHTML=parts.join('');
  $$('#crumbs [data-folder]').forEach(b=>b.addEventListener('click',()=>openFolder(b.dataset.folder||null)));
  const subs = CH.filter(x=> (x.parentId||null) === (state.folder||null)).sort((a,b)=>a.position-b.position);
  $('#subfolders').innerHTML = subs.map(s=>{ const fs=filesIn(s.id); return `<button class="subf" data-folder="${s.id}"><img loading="lazy" alt="" src="${M((fs.find(f=>f.kind==='foto')||fs[0]||{}).thumb)}"><span><b>${s.name}</b><small>${fs.length} arquivos</small></span></button>`; }).join('');
  $$('#subfolders [data-folder]').forEach(b=>b.addEventListener('click',()=>openFolder(b.dataset.folder)));
}
function tileHTML(f){
  return `<div class="tile ${f.kind}" role="button" tabindex="0" data-open="${f.id}" aria-label="${f.kind==='video'?'Vídeo':'Foto'}: ${f.name}">
    <img loading="lazy" decoding="async" src="${M(f.thumb)}" alt="">
    ${f.kind==='video'?`<span class="dur"><svg class="icon"><use href="#i-play"/></svg>${f.duration?fmtDur(f.duration):'Vídeo'}</span>`:''}
    <span class="nm">${f.name}</span>
    <button class="fav" data-id="${f.id}" aria-pressed="${favs.has(f.id)}" aria-label="Favoritar ${f.name}"><svg class="icon"><use href="#i-heart"/></svg></button></div>`;
}
function renderGrid(reset){
  if(reset){ state.list=currentList(); state.shown=0; $('#grid').innerHTML=''; renderCrumbs(); }
  const next=state.list.slice(state.shown, state.shown+PAGE); state.shown+=next.length;
  $('#grid').insertAdjacentHTML('beforeend', next.map(tileHTML).join(''));
  if(!state.list.length){ $('#grid').innerHTML = state.filter==='fav' ? `<div class="empty" style="grid-column:1/-1"><div class="h2">Nenhum favorito ainda</div>Toque no coração das fotos e vídeos que mais emocionaram vocês.</div>` : `<div class="empty" style="grid-column:1/-1"><div class="h2">Nada por aqui</div>Tente outra palavra, como “votos” ou “pista”.</div>`; }
  const size=state.list.reduce((s,f)=>s+f.size,0);
  const folder=state.folder&&CH.find(x=>x.id===state.folder);
  $('#gal-foot').innerHTML = state.list.length ? `<span>Mostrando ${state.shown} de ${state.list.length}${size?' · '+fmtBytes(size):''}</span>${folder?`<button class="pill pill-ghost pill-sm" data-zip="chapter:${folder.id}"><svg class="icon"><use href="#i-dl"/></svg>Baixar “${folder.name}”${size?' ('+fmtBytes(size)+')':''}</button>`:''}` : '';
}
$('#gal-lead').textContent = `${FILES.length} arquivos · ${FILES.filter(f=>f.kind==='video').length} vídeos e ${FILES.filter(f=>f.kind==='foto').length} fotos, organizados na ordem em que aconteceram.`;
new IntersectionObserver(es=>{ if(es[0].isIntersecting && state.shown<state.list.length) renderGrid(false); },{rootMargin:'600px'}).observe($('#sentinel'));
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{ $$('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b)); state.filter=b.dataset.filter; renderGrid(true); }));
let qT; $('#q').addEventListener('input',e=>{ clearTimeout(qT); qT=setTimeout(()=>{ state.q=e.target.value; renderGrid(true); },180); });
$('#sort').addEventListener('change',e=>{ state.sort=e.target.value; renderGrid(true); });

// delegação: abrir / favoritar
document.addEventListener('click', e=>{
  const fb=e.target.closest('.fav[data-id]'); if(fb && !fb.closest('#viewer')){ e.stopPropagation(); toggleFav(fb.dataset.id, fb); return; }
  const o=e.target.closest('[data-open]'); if(o){ const list = o.closest('#grid') ? state.list : o.closest('#hl-rail') ? HL : FILES; openViewer(o.dataset.open, list); }
  const z=e.target.closest('[data-zip]'); if(z) startZip(z.dataset.zip);
});
document.addEventListener('keydown', e=>{ const t=e.target.closest&&e.target.closest('.tile[data-open]'); if(t&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('.fav')){ e.preventDefault(); openViewer(t.dataset.open,state.list); } });

// tempo assistido (métricas): envia ao pausar/terminar/sair
function watchTrack(v, fileId){ let last=0, acc=0; const tick=()=>{ if(!v.paused){ acc+=Math.max(0,Math.min(2,v.currentTime-last)); } last=v.currentTime; };
  v.addEventListener('timeupdate',tick); v.addEventListener('seeking',()=>{ last=v.currentTime; });
  const flush=()=>{ if(acc>=1){ track('watch',{fileId,value:Math.round(acc)}); acc=0; } };
  v.addEventListener('pause',flush); v.addEventListener('ended',flush); window.addEventListener('pagehide',flush); }
// ═════════ VISUALIZADOR ═════════
const V={list:[],i:0};
const REACTS=['🤎','😭','🔥','✨'];
function openViewer(id,list){ V.list=list&&list.length?list:FILES; V.i=Math.max(0,V.list.findIndex(f=>f.id===id)); $('#viewer').classList.add('open'); document.body.classList.add('lock'); showV(); $('#v-close').focus(); }
function closeViewer(){ const v=$('#v-track video'); if(v) v.pause(); $('#viewer').classList.remove('open'); if(!$('.modal.open')&&!$('#polgen.open')) document.body.classList.remove('lock'); }
function showV(dir=0){
  const f=V.list[V.i]; const tr=$('#v-track');
  const vsrc = isMobile ? (M(f.lite)||M(f.web)) : (M(f.web)||M(f.lite)); if(!DATA.preview) track('view',{fileId:f.id});
  const el = f.kind==='video' ? (vsrc ? `<video src="${vsrc}" poster="${M(f.poster)}" controls autoplay playsinline></video>` : `<div style="position:relative;height:100%;display:flex;align-items:center;justify-content:center"><img src="${M(f.thumb)}" alt="${f.name}" style="max-height:100%"><div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;width:min(80%,260px)"><span class="round" style="width:64px;height:64px"><svg class="icon" style="width:26px;height:26px;fill:currentColor;stroke:none"><use href="#i-play"/></svg></span><small style="font-size:12px;background:rgba(11,11,11,.6);padding:6px 12px;border-radius:999px">Vídeo em preparação. Volte em alguns minutos</small></div></div>`) : `<img src="${M(f.poster)||M(f.thumb)}" alt="${f.name}">`;
  tr.style.transition='none'; tr.style.transform=`translateX(${dir*40}px)`; tr.style.opacity=0; tr.innerHTML=el;
  const vv=tr.querySelector('video'); if(vv) watchTrack(vv, f.id);
  requestAnimationFrame(()=>{ tr.style.transition=''; tr.style.transform=''; tr.style.opacity=1; });
  $('#v-count').innerHTML=`<b>${V.i+1}</b> / ${V.list.length}`;
  $('#v-name').textContent=f.name;
  $('#v-meta').textContent=[chapterName(f.chapterId), fmtTime(f.recordedAt), f.kind==='video'&&f.duration?fmtDur(f.duration):''].filter(Boolean).join(' · ');
  $('#v-fav').dataset.id=f.id; $('#v-fav').setAttribute('aria-pressed',favs.has(f.id));
  $('#v-dl span').textContent= f.size ? `Baixar original · ${fmtBytes(f.size)}` : 'Baixar original';
  $('#v-dl-lite').hidden = f.kind!=='video'; $('#v-pol').hidden = f.kind!=='foto';
  const R=(DATA.reactions&&DATA.reactions[f.id])||[]; $('#v-reacts').innerHTML=REACTS.map(r=>`<button class="react" data-r="${r}" aria-pressed="${R.includes(r)}" aria-label="Reagir com ${r}">${r}</button>`).join('');
  [V.list[V.i+1],V.list[V.i-1]].forEach(n=>{ if(n&&n.kind==='foto'){ const im=new Image(); im.src=M(n.thumb);} });
}
const nav=d=>{ const n=V.i+d; if(n<0||n>=V.list.length) return; const v=$('#v-track video'); if(v) v.pause(); V.i=n; showV(d); };
$('#v-prev').onclick=()=>nav(-1); $('#v-next').onclick=()=>nav(1); $('#v-close').onclick=closeViewer;
$('#v-fav').onclick=e=>toggleFav(e.currentTarget.dataset.id, e.currentTarget);
$('#v-reacts').addEventListener('click',e=>{ const b=e.target.closest('[data-r]'); if(!b) return; const f=V.list[V.i]; DATA.reactions=DATA.reactions||{}; let R=DATA.reactions[f.id]||[]; const on=!R.includes(b.dataset.r); R=on?[...R,b.dataset.r]:R.filter(x=>x!==b.dataset.r); DATA.reactions[f.id]=R; post('/react',{fileId:f.id,emoji:b.dataset.r,on}).catch(()=>{}); b.setAttribute('aria-pressed',R.includes(b.dataset.r)); if(R.includes(b.dataset.r)){ const r=b.getBoundingClientRect(); burst(b.dataset.r,r.left+8,r.top); vibrate(10);} });
addEventListener('keydown',e=>{ if(!$('#viewer.open')) { if(e.key==='Escape'){ $$('.modal.open').forEach(closeModal); if($('#polgen.open')) closePG(); } return; }
  if(e.key==='ArrowRight') nav(1); else if(e.key==='ArrowLeft') nav(-1); else if(e.key==='Escape') closeViewer(); else if(e.key.toLowerCase()==='f') $('#v-fav').click(); });
// swipe
let sx=0,sy=0,sw=false; const st=$('#v-stage');
st.addEventListener('touchstart',e=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; sw=true; },{passive:true});
st.addEventListener('touchmove',e=>{ if(!sw) return; const dx=e.touches[0].clientX-sx; if(Math.abs(dx)>Math.abs(e.touches[0].clientY-sy)){ $('#v-track').style.transition='none'; $('#v-track').style.transform=`translateX(${dx}px)`; } },{passive:true});
st.addEventListener('touchend',e=>{ if(!sw) return; sw=false; const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy; const tr=$('#v-track'); tr.style.transition='';
  if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)) nav(dx<0?1:-1); else if(dy>110&&Math.abs(dy)>Math.abs(dx)) closeViewer(); else tr.style.transform=''; });
$('#v-dl').onclick=()=>fakeDownload(V.list[V.i],'original');
$('#v-dl-lite').onclick=()=>fakeDownload(V.list[V.i],'leve');
$('#v-share').onclick=()=>shareFile(V.list[V.i]);
$('#v-pol').onclick=()=>{ openPG(V.list[V.i].id); };
function fakeDownload(f,kind){ if(DATA.preview){ toast('Na pré-visualização os downloads ficam desativados'); return; } const a=document.createElement('a'); a.href=`/api/f/${f.id}/download?v=${kind==='leve'?'lite':'original'}`; document.body.appendChild(a); a.click(); a.remove();
  toast(kind==='leve'?'Baixando a versão leve (720p)':'Baixando o original'+(f.size?' · '+fmtBytes(f.size):'')); }
async function shareFile(f){ track('share',{fileId:f.id}); const url=location.href.split('#')[0]+'#'+f.id; const data={title:f.name, text:`${f.name} · ${EV.clientNames}`, url};
  try{ if(navigator.share){ await navigator.share(data); return; } }catch(e){ if(e.name==='AbortError') return; }
  try{ await navigator.clipboard.writeText(url); toast('Link copiado'); }catch{ toast('Copie o link na barra do navegador'); } }

// ═════════ DOWNLOADS ═════════
const TOTAL=FILES.reduce((s,f)=>s+f.size,0);
$('#dl-total').innerHTML= TOTAL ? fmtBytes(TOTAL).replace(/ (GB|MB)/,'<small>$1</small>') : FILES.length+'<small>arquivos</small>';
$('#dl-total-sub').textContent=`${FILES.length} arquivos originais em um único ZIP. Para arquivos grandes, preparamos o ZIP e avisamos quando estiver pronto.`;
// ── Arquivos brutos: baixam direto do Drive, sem o cliente precisar abrir o Drive ──
const RAW = DATA.raw || [];
if (RAW.length) {
  const nRaw = RAW.reduce((a,r)=>a+r.files.length,0), sRaw = RAW.reduce((a,r)=>a+r.size,0);
  $('#raw-card').hidden = false;
  $('#raw-sub').textContent = `${nRaw} arquivos sem edição${sRaw?' · '+fmtBytes(sRaw):''}. Para quem quer guardar tudo do jeito que foi gravado.`;
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const sz = sRaw ? fmtBytes(sRaw) : '';
  $('#raw-guide').innerHTML = `
    <div class="raw-step-box"><h4>Antes de começar</h4><ul>
      <li>Use um <b>computador</b>. No celular, o Drive pode não baixar a pasta inteira.</li>
      <li>Deixe ${sz?`<b>${sz}</b>`:'espaço'} livres no computador ou no Drive (ou no HD externo).</li>
      <li>Use uma internet estável e deixe a página aberta até o fim.</li>
    </ul></div>
    <div class="raw-step-box"><h4>Passo a passo</h4><ol>
      <li>Clique no botão <b>“Abrir pasta no Drive”</b>.</li>
      <li>No Drive, clique em <b>“Fazer download de tudo”</b>, no canto superior direito. Se não aparecer, clique no nome da pasta, no topo, e depois em <b>“Fazer download”</b> ou <b>“Baixar”</b>.</li>
      <li>O Drive mostra <b>“Preparando o download”</b> no canto da tela. Pode levar alguns minutos. Não feche a aba.</li>
      <li>Se o navegador perguntar se pode baixar vários arquivos, clique em <b>“Permitir”</b>.</li>
      <li>Os arquivos chegam em <b>várias partes .zip</b> (de até 2 GB cada), com final -001, -002, -003… Baixe todas.</li>
      <li>Se aparecer o aviso de que o Drive não conseguiu verificar vírus, clique em <b>“Fazer o download assim mesmo”</b>. Vídeos grandes podem vir separados, fora do .zip.</li>
    </ol></div>
    <div class="raw-step-box"><h4>Para não faltar nenhum arquivo</h4><ul>
      <li>Confira se a numeração das partes está em sequência, sem pular nenhuma.</li>
      <li>Extraia todas as partes <b>na mesma pasta</b>: no Windows, botão direito → “Extrair tudo”; no Mac, clique duas vezes.</li>
      <li>No final, a pasta deve ter o número de arquivos sinalizado no início (<b>${nRaw} arquivos</b>). Se faltar algum, volte ao Drive e baixe só ele (botão direito no arquivo → “Fazer download”).</li>
      <li>Guarde uma cópia em um HD externo ou na nuvem.</li>
    </ul></div>`;
  $('#raw-count').innerHTML = `Esta pasta tem <b>${nRaw} arquivos</b>${sz?` · ${sz}`:''}.`;
  const folderBtns = (cls)=>RAW.filter(r=>r.folder).map(r=>`<a class="pill ${cls}" href="${esc(r.folder)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-dl"/></svg>Abrir pasta no Drive${RAW.length>1?' · '+esc(r.name):''}</a>`).join('');
  $('#raw-actions').innerHTML = folderBtns('pill-cream');
  $('#raw-actions').addEventListener('click', e=>{ if(e.target.closest('a')) track('raw_folder'); });
  $('#raw-open').addEventListener('click', ()=>openModal('#raw-modal'));
}
$('#dl-list').innerHTML=tops.map(c=>{ const fs=filesIn(c.id), s=fs.reduce((a,f)=>a+f.size,0); return `<div class="dl-row"><div>${c.name}<small>${fs.length} arquivos${s?' · '+fmtBytes(s):''}</small></div><button data-zip="chapter:${c.id}"><svg class="icon"><use href="#i-dl"/></svg>Baixar</button></div>`; }).join('');
let ZIP=null, zipTimer=null;
async function startZip(scope){
  if(DATA.preview){ toast('Na pré-visualização os downloads ficam desativados'); return; }
  let l=FILES, label='todos os arquivos';
  if(scope==='fav'){ l=FILES.filter(f=>favs.has(f.id)); label='seus favoritos'; if(!l.length){ toast('Escolha seus favoritos primeiro 🤎'); return; } }
  if(scope.startsWith('chapter:')){ const id=scope.slice(8); l=filesIn(id); label=`“${CH.find(c=>c.id===id).name}”`; }
  if(l.length===1){ fakeDownload(l[0],'original'); return; }
  const s=l.reduce((a,f)=>a+f.size,0);
  $('#zip-t').textContent='Preparando seu download'; $('#zip-bar').style.width='3%'; $('#zip-ready').hidden=true; $('#zip-fields').hidden=false;
  $('#zip-desc').textContent=`Estamos juntando ${label}: ${l.length} arquivos${s?', '+fmtBytes(s)+' no total':''}. Pode fechar esta janela: deixe seu WhatsApp ou e-mail e a gente avisa quando o ZIP estiver pronto.`;
  openModal('#zip-modal');
  try{ ZIP = await post('/zip',{scope, fileIds:l.map(f=>f.id), label}); pollZip(); }
  catch{ $('#zip-desc').textContent='Não conseguimos começar agora. Tente de novo em instantes.'; }
}
function pollZip(){ clearTimeout(zipTimer); if(!ZIP) return;
  fetch(API+'/zip/'+ZIP.id).then(r=>r.json()).then(z=>{ ZIP={...ZIP,...z};
    $('#zip-bar').style.width=Math.max(3,z.progress||0)+'%';
    if(z.status==='pronto'){ $('#zip-t').textContent='Seu ZIP está pronto'; $('#zip-ready').hidden=false; $('#zip-ready').href=API+'/zip/'+ZIP.id+'/download'; $('#zip-ready span').textContent='Baixar ZIP'+(z.size?' · '+fmtBytes(z.size):''); $('#zip-fields').hidden=true; return; }
    if(z.status==='erro'){ $('#zip-t').textContent='Algo deu errado'; $('#zip-desc').textContent='Tivemos um problema ao montar o ZIP. Nossa equipe já foi avisada.'; return; }
    if($('#zip-modal').classList.contains('open')) zipTimer=setTimeout(pollZip, 4000);
  }).catch(()=>{ zipTimer=setTimeout(pollZip, 8000); });
}
$('#zip-form').addEventListener('submit',e=>{ e.preventDefault(); if(!ZIP) return closeModal($('#zip-modal'));
  post('/zip/'+ZIP.id,{email:$('#zip-mail').value.trim(), phone:$('#zip-wa').value.trim()},'PATCH').catch(()=>{});
  closeModal($('#zip-modal')); toast('Combinado! Avisamos assim que estiver pronto.'); });

// ═════════ COMPARTILHAR ═════════
if(M('story')){ $('#story-video').src=M('story'); } else { $('#share-clip').hidden=true; } $('#story-video').poster=M('story-poster')||M('cover');
$('#caption').textContent=EV.shareCaption;
$('#copy-caption').onclick=async()=>{ try{ await navigator.clipboard.writeText(EV.shareCaption); toast('Legenda copiada'); track('share',{meta:{what:'caption'}}); }catch{ toast('Selecione e copie a legenda'); } };
$('#share-clip').onclick=async()=>{
  try{ const blob=await (await fetch(M('story'))).blob(); const file=new File([blob],'be-story-clipe.mp4',{type:'video/mp4'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file], text:EV.shareCaption}); track('share',{meta:{what:'clip'}}); return; } }catch(e){ if(e.name==='AbortError') return; }
  const a=document.createElement('a'); a.href=M('story'); a.download='be-story-clipe.mp4'; a.click(); toast('Clipe baixado. É só postar!');
};

// ═════════ GERAR MINHA POLAROID ═════════
const PG={fmt:'feed', id:null};
const PHOTOS=FILES.filter(f=>f.kind==='foto');
$('#pg-picks').innerHTML=PHOTOS.map(f=>`<button data-pick="${f.id}" aria-pressed="false" aria-label="${f.name}"><img loading="lazy" src="${M(f.thumb)}" alt=""></button>`).join('');
$('#pg-picks').addEventListener('click',e=>{ const b=e.target.closest('[data-pick]'); if(!b) return; PG.id=b.dataset.pick; drawPG(); });
$$('[data-fmt]').forEach(b=>b.onclick=()=>{ PG.fmt=b.dataset.fmt; $$('[data-fmt]').forEach(x=>x.setAttribute('aria-pressed',x===b)); drawPG(); });
function openPG(id){ PG.id=id||(HL.find(f=>f.kind==='foto')||PHOTOS[0]).id; $('#polgen').classList.add('open'); document.body.classList.add('lock'); drawPG(); }
function closePG(){ $('#polgen').classList.remove('open'); if(!$('#viewer.open')) document.body.classList.remove('lock'); }
$('#open-polgen').onclick=()=>openPG(); $('#pg-close').onclick=closePG;
const loadImg=src=>new Promise((r,j)=>{ const i=new Image(); if(/^https?:/.test(src)) i.crossOrigin='anonymous'; i.onload=()=>r(i); i.onerror=j; i.src=src; });
async function drawPG(){
  $$('[data-pick]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.pick===PG.id));
  const f=FILES.find(x=>x.id===PG.id); const c=$('#pg-canvas'), W=1080, H=PG.fmt==='feed'?1350:1920; c.width=W; c.height=H; const x=c.getContext('2d');
  const css=getComputedStyle(document.documentElement), SCRIPT=css.getPropertyValue('--script').trim()||'"Gentlemens Script", cursive', SANS=css.getPropertyValue('--sans').trim()||'Poppins, sans-serif';
  try{ await document.fonts.load(`80px ${SCRIPT}`); await document.fonts.load(`500 20px ${SANS}`); }catch{}
  const img=await loadImg(M(f.poster)||M(f.thumb)), logo=await loadImg(M('logo'));
  // fundo quente com a própria foto desfocada
  x.fillStyle='#0f0d0b'; x.fillRect(0,0,W,H); x.save(); x.filter='blur(40px) brightness(.45)'; cover(x,img,-60,-60,W+120,H+120); x.restore();
  const g=x.createRadialGradient(W/2,0,0,W/2,0,H); g.addColorStop(0,'rgba(255,226,180,.18)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,W,H);
  const pw=PG.fmt==='feed'?760:820, pad=pw*.06, ph=pw*1.2, px=(W-pw)/2, py=(H-ph)/2 - (PG.fmt==='feed'?10:60);
  x.save(); x.translate(W/2,py+ph/2); x.rotate(-2*Math.PI/180); x.translate(-W/2,-(py+ph/2));
  x.shadowColor='rgba(0,0,0,.6)'; x.shadowBlur=60; x.shadowOffsetY=30; x.fillStyle='#f6f1e7'; x.fillRect(px,py,pw,ph); x.shadowColor='transparent';
  const iw=pw-pad*2; cover(x,img,px+pad,py+pad,iw,iw);
  x.fillStyle='#2b2420'; x.textAlign='center'; x.font=`${Math.round(pw*.1)}px ${SCRIPT}`;
  x.fillText(EV.clientNames, W/2, py+pad+iw+(ph-pad-iw)*.5); x.font=`500 ${Math.round(pw*.026)}px ${SANS}`; x.fillStyle='#6b5d52'; x.letterSpacing=Math.round(pw*.01)+'px'; x.fillText(dateShort(EV.eventDate), W/2+pw*.005, py+pad+iw+(ph-pad-iw)*.82); x.letterSpacing='0px';
  x.restore();
  // assinatura discreta
  const lw=64, lh=lw*logo.height/logo.width; x.globalAlpha=.85; x.drawImage(logo,W/2-lw/2,H-(PG.fmt==='feed'?160:250),lw,lh); x.globalAlpha=1;
  x.fillStyle='rgba(250,248,244,.6)'; x.font=`500 20px ${SANS}`; x.letterSpacing='6px'; x.fillText('BE STORY · @BESTUDIOAUDIOVISUAL', W/2, H-(PG.fmt==='feed'?52:140)); x.letterSpacing='0px';
}
function cover(x,img,dx,dy,dw,dh){ const r=Math.max(dw/img.width,dh/img.height), sw=dw/r, sh=dh/r; x.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,dx,dy,dw,dh); }
$('#pg-dl').onclick=()=>{ track('share',{fileId:PG.id,meta:{what:'polaroid'}}); $('#pg-canvas').toBlob(b=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`polaroid-${EV.slug}-${PG.fmt}.jpg`; a.click(); toast('Polaroid baixada'); },'image/jpeg',.92); };
$('#pg-share').onclick=()=>{ $('#pg-canvas').toBlob(async b=>{ const file=new File([b],`polaroid-${EV.slug}.jpg`,{type:'image/jpeg'});
  try{ if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],text:EV.shareCaption}); return; } }catch(e){ if(e.name==='AbortError') return; } $('#pg-dl').click(); },'image/jpeg',.92); };

// ═════════ BILHETE ═════════
let rating=0; $('#stars').innerHTML=[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="false" aria-label="${n} ${n===1?'estrela':'estrelas'}" data-star="${n}">★</button>`).join('');
$('#stars').addEventListener('click',e=>{ const b=e.target.closest('[data-star]'); if(!b) return; rating=+b.dataset.star; $$('[data-star]').forEach(s=>{ s.classList.toggle('on',+s.dataset.star<=rating); s.setAttribute('aria-checked',+s.dataset.star===rating); }); vibrate(8); });
$('#note-form').addEventListener('submit',async e=>{ e.preventDefault(); const name=$('#n-name').value.trim(); const btn=e.target.querySelector('button[type=submit]'); btn.disabled=true;
  try{ if(!DATA.preview) await post('/note',{name, body:$('#n-msg').value.trim(), rating:rating||null, allowPublic:$('#n-pub').checked}); }catch{ btn.disabled=false; toast('Não conseguimos enviar agora. Tente de novo.'); return; }
  $('#note-fields').innerHTML=`<div class="thanks"><p>Recebemos, ${name.split(/[ &]/)[0]||'obrigada'}!</p><span style="font-size:14px;color:#5b4f45">Seu bilhete chegou direitinho na BE. Obrigada por cada palavra. 🤎</span></div>`; });

// ═════════ ENCERRAMENTO ═════════
const WA = DATA.links.whatsapp;
const shareText = url => `Olha que lindo o site de memórias que a BE Studio fez do nosso evento! 🤎 Se você vai ter um evento, fala com eles: ${url}`;
$('#refer').href = `https://wa.me/?text=${encodeURIComponent(shareText(`https://wa.me/${WA}`))}`;
let refLoaded=false;
new IntersectionObserver((es,o)=>es.forEach(e=>{ if(e.isIntersecting && !refLoaded && !DATA.preview){ refLoaded=true; o.disconnect();
  const cached=store.get('ref',null); const use=u=>{ $('#refer').href=`https://wa.me/?text=${encodeURIComponent(shareText(u))}`; };
  if(cached) use(cached); else post('/referral').then(r=>{ if(r.url){ store.set('ref',r.url); use(r.url); } }).catch(()=>{}); } }),{rootMargin:'800px'}).observe($('#fim'));
$('#refer').addEventListener('click',()=>track('share',{meta:{what:'referral'}}));
$('#book').href=`https://wa.me/${WA}?text=${encodeURIComponent('Oi, BE! Vi o site de memórias de '+EV.clientNames+' e quero agendar a cobertura do meu próximo evento.')}`;
new IntersectionObserver((es,o)=>es.forEach(e=>{ if(e.isIntersecting){ fitHand($('#fim-hand')); $('#fim-hand').classList.add('write'); o.disconnect(); } }),{threshold:.6}).observe($('#fim-pol'));
$('#restart').onclick=()=>{ store.set('revealed',false); location.hash=''; location.reload(); };

// ── início ──
if(DATA.preview){ $('#demo-tag').textContent='Pré-visualização'; } else { $('#demo-tag').remove(); }
(function accentContrast(){
  // Cor de destaque legível: no fundo do tema e nas áreas escuras (sobre fotos, cartões escuros)
  const hex=(EV.accent||'#c9a77c').replace('#',''); const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const lum=rgb.map(c=>c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
  const darkTheme=['classico-escuro','sepia'].includes(EV.theme||'classico-escuro');
  const base='#'+hex, root=document.documentElement.style;
  const onDark = lum>.3 ? base : `color-mix(in srgb, ${base} 35%, #faf4ea)`;
  const onLight = lum<.25 ? base : `color-mix(in srgb, ${base} 55%, #20150c)`;
  root.setProperty('--accent', darkTheme ? onDark : onLight);
  root.setProperty('--accent-hi', onDark);
})();
if (EV.expiresAt) { const d=new Date(EV.expiresAt); $('#dl-lead').textContent = `Os arquivos ficam no ar até ${d.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Fortaleza'})}. Baixe tudo para o seu armazenamento e reviva sempre que quiser.`; }
if(EV.letter){ const L=$('#op-letter'); $$('#op-letter p.l').forEach(p=>p.remove()); const anchor=L.querySelector('.sign'); EV.letter.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean).forEach(t=>{ const p=document.createElement('p'); p.className='l'; p.textContent=t; L.insertBefore(p, anchor); }); }
$('#n-name').placeholder=EV.clientNames;
$('#footer-ig').href='https://instagram.com/'+DATA.links.instagram; $('#footer-ig').textContent='@'+DATA.links.instagram;
$('#pol').setAttribute('aria-label','Foto Polaroid de '+EV.clientNames.replace('&','e'));
if(!EV.location){ $('#hero-place').remove(); $$('.hero-meta .dot').forEach(d=>d.remove()); }
if(!M('film')) $('#watch-film').hidden=true;

updateFavUI(); renderGrid(true);
if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('/sw.js').catch(()=>{});
startOpening(); track('open', {meta:{ref: new URLSearchParams(location.search).get('ref')||undefined}});
})();
