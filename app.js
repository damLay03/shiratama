/* shiratama — luyện đề JLPT có giải thích + ôn thẻ bằng FSRS.
   Nội dung đề được mã hóa (AES-GCM) trong data/*.enc; chỉ mở được khi nhập đúng mã. */
(function(){
'use strict';
const APP='shiratama';
const EXAM_DAY=new Date('2026-12-06T09:00:00+09:00');
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rich=s=>esc(s).replace(/&lt;u&gt;/g,'<u>').replace(/&lt;\/u&gt;/g,'</u>');
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const SEC={moji:1,bunpou:1,dokkai:1,choukai:1};
const SECN={moji:['Chữ Hán & từ vựng','Kanji & vocabulary'],bunpou:['Ngữ pháp','Grammar'],dokkai:['Đọc hiểu','Reading'],choukai:['Nghe hiểu','Listening']};
const PARTN={'moji':['Chữ Hán & từ vựng','Kanji & vocabulary'],'bunpou+dokkai':['Ngữ pháp & đọc hiểu','Grammar & reading'],'choukai':['Nghe hiểu','Listening']};
const TYPEN={moji1:['Đọc chữ Hán','Kanji reading'],moji2:['Viết chữ Hán','Kanji writing'],moji3:['Điền từ theo ngữ cảnh','Word in context'],moji4:['Từ đồng nghĩa','Paraphrase'],moji5:['Cách dùng từ','Word usage'],
 bunpou1:['Chọn mẫu ngữ pháp','Grammar form'],bunpou2:['Sắp xếp câu','Sentence building'],bunpou3:['Ngữ pháp trong đoạn văn','Grammar in a text'],
 dokkai4:['Đoạn văn ngắn','Short passages'],dokkai5:['Đoạn văn vừa','Medium passages'],dokkai6:['Đoạn văn dài','Long passage'],dokkai7:['Tìm thông tin','Finding information'],
 choukai1:['Hiểu nhiệm vụ','Task-based'],choukai2:['Nắm điểm chính','Key points'],choukai3:['Hiểu khái quát','Overall gist'],choukai4:['Chọn câu nói','Verbal expressions'],choukai5:['Đáp nhanh','Quick response']};
const L=(vi,en)=>S.lang==='en'?en:vi;
const LL=a=>a?L(a[0],a[1]):'';
const secName=k=>LL(SECN[k]);
const partName=p=>LL(PARTN[p.key])||p.name;
const typeName=q=>LL(TYPEN[q.sec+q.m])||q.type;
const examTitle=ex=>L('Đề chính thức JLPT N3 (2018)','Official JLPT N3 sample test (2018)');
const SIZES=[17,19,21,23,25];

/* ---------- state ---------- */
const KEY='shiratama-v1';
const DEF={v:1,ans:{},cards:{},exams:{},theme:'auto',mode:'auto',size:2,lang:'vi'};
let S=Object.assign(structuredClone(DEF),ls.get(KEY,{}));
if(S.size==null)S.size=2; if(!S.mode)S.mode='auto'; if(!S.lang)S.lang='vi';
const save=()=>ls.set(KEY,S);
let DATA=null, QI={}, SS=null, AK=null, TAB='home';

/* ---------- FSRS ---------- */
const hasF=typeof FSRS!=='undefined';
const F=hasF?FSRS.fsrs(FSRS.generatorParameters({request_retention:0.9,maximum_interval:180,enable_fuzz:true})):null;
function revive(c){const o=Object.assign({},c);o.due=new Date(c.due);if(c.last_review)o.last_review=new Date(c.last_review);return o}
function rate(id,grade){if(!hasF)return;const now=new Date();const cur=S.cards[id]?revive(S.cards[id]):FSRS.createEmptyCard(now);S.cards[id]=F.repeat(cur,now)[grade].card}
function dueIds(){const now=Date.now();return Object.keys(S.cards).filter(id=>QI[id]&&new Date(S.cards[id].due).getTime()<=now)}

/* ---------- ngày / đêm, cỡ chữ ---------- */
function isNight(){if(S.mode==='day')return false;if(S.mode==='night')return true;const h=new Date().getHours();return h>=18||h<6}
function applyLook(){const r=document.documentElement;r.lang=S.lang==='en'?'en':'vi';r.setAttribute('data-mode',isNight()?'night':'day');r.style.setProperty('--jp-size',SIZES[S.size]+'px');
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=isNight()?'#151b3f':'#cfe6f8'}
applyLook();setInterval(applyLook,60000);

/* ---------- content (encrypted) ---------- */
async function deriveKey(code,salt){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(code.trim()),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
}
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function loadContent(code){
  const idx=await fetch('data/index.json',{cache:'no-cache'}).then(r=>r.json());
  const exams=[];
  for(const f of idx.files){
    const enc=await fetch('data/'+f,{cache:'no-cache'}).then(r=>r.json());
    const key=await deriveKey(code,b64(enc.salt));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(enc.iv)},key,b64(enc.data));
    exams.push(JSON.parse(new TextDecoder().decode(plain)));
  }
  return {exams};
}
function indexData(){QI={};DATA.exams.forEach(ex=>ex.qs.forEach(q=>{QI[q.id]={q,ex}}))}

/* ---------- helpers ---------- */
function record(q,ok,mode,ms){(S.ans[q.id]=S.ans[q.id]||[]).push({t:Date.now(),ok:ok?1:0,m:mode,ms:ms|0})}
function lastOk(id){const a=S.ans[id];return a&&a.length?a[a.length-1].ok:null}
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
function fmtTime(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function daysLeft(){return Math.max(0,Math.ceil((EXAM_DAY-Date.now())/864e5))}
function allBy(sec){return Object.values(QI).map(x=>x.q).filter(q=>q.sec===sec)}
function partQs(ex,p){const keys=p.key.split('+');return ex.qs.filter(q=>keys.includes(q.sec))}
function plain(s){return String(s||'').replace(/<\/?u>/g,'').replace(/\n/g,' ')}
const I={
  gear:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  x:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  undo:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  play:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  pause:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  again:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>',
  cards:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="15" rx="2.5"/><path d="M8 3h10.5A2.5 2.5 0 0 1 21 5.5V17"/></svg>',
  test:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  chart:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  search:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  dots:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  pen:'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  ok:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>'
};

/* ---------- audio ---------- */
let AU=null,AUQ=null,AUTick=null;
function stopAudio(){if(AU)AU.pause();clearInterval(AUTick);AUQ=null;const b=$('#aubtn');if(b)b.innerHTML=I.play}
function playSeg(q,restart){
  if(!AU){AU=new Audio();AU.preload='auto'}
  const [a,b]=q.t;
  const go=()=>{if(restart||AU.currentTime<a||AU.currentTime>=b-0.2)AU.currentTime=a;AU.play().catch(()=>toast(L('Không phát được âm thanh','Could not play audio')))};
  if(AU.dataset.src!==q.audio){AU.src=q.audio;AU.dataset.src=q.audio;AU.addEventListener('loadedmetadata',go,{once:true});AU.load()}else go();
  AUQ=q.id;const bt=$('#aubtn');if(bt)bt.innerHTML=I.pause;
  clearInterval(AUTick);AUTick=setInterval(()=>{
    const tr=$('#autrack');if(tr)tr.style.width=Math.min(100,Math.max(0,(AU.currentTime-a)/(b-a)*100))+'%';
    const tt=$('#autime');if(tt)tt.textContent=fmtTime(AU.currentTime-a)+' / '+fmtTime(b-a);
    if(AU.currentTime>=b){AU.pause();stopAudio()}
  },200);
}
function audioHTML(q){return `<div class="audio"><button class="play" id="aubtn" aria-label="Play">${I.play}</button><div class="track"><i id="autrack"></i></div><span class="tiny" id="autime">0:00 / ${fmtTime(q.t[1]-q.t[0])}</span><button class="again" id="aurestart" aria-label="Replay">${I.again}</button></div>`}
function bindAudio(q){const b=$('#aubtn');if(!b)return;b.onclick=()=>{if(AUQ===q.id&&!AU.paused){AU.pause();b.innerHTML=I.play}else playSeg(q)};$('#aurestart').onclick=()=>playSeg(q,true)}

/* ---------- khung ---------- */
const SKY=`<div class="sky"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="b5"></i>
<svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">${Array.from({length:70},(_,k)=>{const x=(k*97)%400,y=(k*173)%800,r=(k%5===0)?1.6:(k%3===0?1.1:.7);return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${.35+(k%4)*.15}"/>`}).join('')}</svg></div>`;
function ensureSky(){if(!document.querySelector('.sky'))document.body.insertAdjacentHTML('afterbegin',SKY)}
function shell(inner,{tabs=true}={}){
  ensureSky();
  $('#app').innerHTML=`<div class="wrap">${inner}</div>`+(tabs?`<nav class="tabs">
   ${[['home',I.cards,L('Học thẻ','Study')],['browse',I.search,L('Duyệt thẻ','Browse')],['exam',I.test,L('Luyện đề','Practice')],['stats',I.chart,L('Tiến độ','Progress')]].map(([k,j,v])=>`<button data-tab="${k}" class="${TAB===k?'on':''}"><b>${j}</b>${v}</button>`).join('')}</nav>`:'');
  $$('[data-tab]').forEach(b=>b.onclick=()=>{TAB=b.dataset.tab;render()});
  const g=$('#gear');if(g)g.onclick=settings;
  window.scrollTo(0,0);
}
function full(inner){ensureSky();$('#app').innerHTML=`<div class="sess">${inner}</div>`}
function header(){return `<div class="top"><div class="brand"><img class="mark" src="img/mark.webp" alt=""><div>${APP}</div></div><button class="iconbtn" id="gear" aria-label="Settings">${I.gear}</button></div>`}

function settings(){
  const v=document.createElement('div');v.className='veil';
  const draw=()=>{v.innerHTML=`<div class="panel">
    <div class="row" style="margin-bottom:14px"><div class="grow" style="font-weight:800;font-size:18px">${L('Cài đặt','Settings')}</div><button class="iconbtn" id="sx" aria-label="Close">${I.x}</button></div>
    <div class="tiny" style="margin:0 2px 6px">${L('Ngôn ngữ','Language')}</div>
    <div class="seg" style="margin-bottom:16px">${[['vi','Tiếng Việt'],['en','English']].map(([k,l])=>`<button data-l="${k}" class="${S.lang===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="tiny" style="margin:0 2px 6px">${L('Giao diện','Appearance')}</div>
    <div class="seg" id="smode">${[['auto',L('Theo giờ','By time')],['day',L('Ban ngày','Day')],['night',L('Ban đêm','Night')]].map(([k,l])=>`<button data-m="${k}" class="${S.mode===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="tiny" style="margin:6px 2px 16px">${L('Theo giờ: trời sao từ 18:00 đến 6:00.','By time: starry night from 18:00 to 6:00.')}</div>
    <div class="tiny" style="margin:0 2px 6px">${L('Cỡ chữ tiếng Nhật','Japanese text size')}</div>
    <div class="row"><button class="btn line" id="sm" ${S.size?'':'disabled'}>A−</button><div class="grow center jp" style="font-size:${SIZES[S.size]}px">日本語の勉強</div><button class="btn line" id="sp" ${S.size<SIZES.length-1?'':'disabled'}>A+</button></div>
  </div>`;
    v.querySelector('#sx').onclick=()=>{v.remove();render()};
    v.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{S.lang=b.dataset.l;save();applyLook();draw()});
    v.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.m;save();applyLook();draw()});
    v.querySelector('#sm').onclick=()=>{S.size=Math.max(0,S.size-1);save();applyLook();draw()};
    v.querySelector('#sp').onclick=()=>{S.size=Math.min(SIZES.length-1,S.size+1);save();applyLook();draw()};
  };
  v.onclick=e=>{if(e.target===v){v.remove();render()}};
  draw();document.body.appendChild(v);
}

function render(){
  stopAudio();applyLook();
  if(!DATA)return lockScreen();
  if(SS)return renderSession();
  if(AK)return renderAnki();
  document.body.classList.remove('editing');({home,browse,exam:examList,stats}[TAB]||home)();
}

/* ---------- lock ---------- */
function lockScreen(err){
  shell(`${header()}<div class="card center" style="margin-top:24px"><img class="mascot" src="img/mark.webp" alt="">
  <p style="font-size:22px;font-weight:800;margin:0 0 4px">${L('Chào anh','Welcome')}</p><p class="muted small" style="margin:0 0 16px">${L('Nhập mã để mở bộ đề. Mỗi máy chỉ cần nhập một lần.','Enter your code to unlock the tests. Once per device.')}</p>
  <input class="field" id="code" placeholder="${L('Mã của anh','Your code')}" autocomplete="off" autocapitalize="off" spellcheck="false">
  ${err?`<p class="small" style="color:var(--ng)">${esc(err)}</p>`:''}
  <button class="btn bee" id="open" style="width:100%;margin-top:14px">${L('Mở','Open')}</button></div>`,{tabs:false});
  const go=async()=>{const c=$('#code').value;if(!c)return;$('#open').disabled=true;$('#open').textContent=L('Đang mở…','Opening…');
    try{DATA=await loadContent(c);ls.set('shiratama-code',c);indexData();await openBundle(c);render()}catch(e){lockScreen(L('Mã không đúng, hoặc chưa tải được đề.','Wrong code, or the tests could not be loaded.'))}};
  $('#open').onclick=go;$('#code').onkeydown=e=>{if(e.key==='Enter')go()};
}

/* ---------- đề thi ---------- */
function examList(){
  const ex=DATA.exams[0];
  const hist=(S.exams[ex.id]||[]).slice(-5).reverse();
  const due=dueIds().length;
  shell(`${header()}
  <div class="h">${L('Luyện theo phần','Practice by section')}</div>
  <div class="secgrid">${Object.keys(SEC).map(k=>{const qs=allBy(k);const t=qs.filter(q=>S.ans[q.id]).length;return `<button class="sec" data-prac="${k}"><div style="font-weight:800">${secName(k)}</div><div class="tiny" style="margin-top:6px">${t}/${qs.length} ${L('câu đã làm','done')}</div></button>`}).join('')}</div>
  <div class="h">${L('Đề thi thật','Real test')}</div>
  <div class="card"><div style="font-size:19px;font-weight:800">${examTitle(ex)}</div><div class="tiny" style="margin-top:2px">${L('Nguồn: jlpt.jp · đáp án chính thức','Source: jlpt.jp · official answers')}</div></div>
  ${ex.parts.map((p,i)=>{const qs=partQs(ex,p);return `<div class="card"><div style="font-size:17px;font-weight:800">${partName(p)}</div><div class="tiny">${qs.length} ${L('câu','questions')} · ${p.min} ${L('phút','min')}</div>
   <div class="row" style="margin-top:12px"><button class="btn bee" data-ex="${i}">${L('Thi thật','Timed test')}</button><button class="btn line" data-exp="${i}">${L('Luyện từng câu','One by one')}</button></div></div>`}).join('')}
  ${hist.length?`<div class="h">${L('Lần làm gần đây','Recent attempts')}</div><div class="card">${hist.map(h=>`<div class="list-item"><div class="grow"><div>${esc(partName(ex.parts.find(p=>p.name===h.name)||{name:h.name}))}</div><div class="tiny">${new Date(h.at).toLocaleString(L('vi-VN','en-GB'))}</div></div><b>${h.c}/${h.n}</b></div>`).join('')}</div>`:''}
  <p class="tiny center">${L('Âm thanh phát trực tiếp từ jlpt.jp.','Audio streams from jlpt.jp.')}</p>`);
  $$('[data-prac]').forEach(b=>b.onclick=()=>startPractice(b.dataset.prac));
  $$('[data-ex]').forEach(b=>b.onclick=()=>startExam(ex,ex.parts[+b.dataset.ex],true));
  $$('[data-exp]').forEach(b=>b.onclick=()=>startExam(ex,ex.parts[+b.dataset.exp],false));
}

/* ---------- phiên làm bài ---------- */
function startExam(ex,part,timed){SS={kind:timed?'exam':'practice',title:partName(part),ex,qs:partQs(ex,part),i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now(),deadline:timed?Date.now()+part.min*60000:0,total:part.min*60,part};render()}
function startPractice(sec,n=10){
  const score=q=>{const lo=lastOk(q.id);return lo===null?0:lo===0?1:2};
  const pick=shuffle(allBy(sec)).sort((a,b)=>score(a)-score(b)).slice(0,n);
  pick.sort((a,b)=>(a.p||'').localeCompare(b.p||'')||a.no-b.no);
  SS={kind:'practice',title:secName(sec),qs:pick,i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now()};render();
}
function startReview(){const ids=shuffle(dueIds());if(!ids.length){toast(L('Chưa có câu nào đến hạn','Nothing due yet'));return}
  SS={kind:'review',title:L('Ôn câu sai','Missed questions'),qs:ids.map(id=>QI[id].q),i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now()};render()}
let TIMER=null;
function passageHTML(ex,q){
  const p=ex.passages[q.p];if(!p)return '';
  let t=esc(p.text).replace(/【(.+?)】/g,'<mark>$1</mark>');
  if(q.sec==='bunpou'){const n=q.q.replace(/[［］]/g,'');t=t.replace(new RegExp('［'+n+'］'),'<mark>［'+n+'］</mark>')}
  return `${p.title?`<span class="pt">${esc(p.title)}</span>`:''}${p.intro?`<span class="muted">${esc(p.intro)}</span>\n\n`:''}${t}`;
}
function renderSession(){
  clearInterval(TIMER);
  const q=SS.qs[SS.i], ex=QI[q.id].ex, exam=SS.kind==='exam';
  const pick=SS.picks[q.id], shown=SS.shown[q.id];
  const hasP=q.p&&ex.passages[q.p];
  const hideStem=q.sec==='choukai'&&!shown&&(exam||q.m>=3);
  const stem=hideStem?`<div class="stem muted" style="font-size:15px">${L('Nghe để biết câu hỏi','Listen for the question')}</div>`:`<div class="stem">${rich(q.q)}</div>`;
  const opts=q.o.map((o,k)=>{
    let cls='opt';
    if(shown){if(k===q.a)cls+=' right';else if(k===pick)cls+=' wrong';else cls+=' dim'}
    else if(k===pick)cls+=' sel';
    const label=q.hideOpts&&!shown?`<span class="tiny">${L('(nghe lựa chọn trong audio)','(options are in the audio)')}</span>`:esc(o);
    let ex2='';
    if(shown){const why=k===q.a?q.why:(q.w&&q.w[k]);if(why)ex2=`<div class="ex">${k===q.a?`<b>${L('Đúng.','Correct.')}</b> `:''}${esc(why)}</div>`}
    return `<button class="${cls}" data-k="${k}" ${shown?'disabled':''}><div class="l"><span class="n">${k+1}</span><span>${label}</span></div><div class="hint">${exam?L('Chạm lần nữa để chọn','Tap again to choose'):L('Chạm lần nữa để chốt','Tap again to confirm')}</div>${ex2}</button>`}).join('');
  let after='';
  if(shown){
    const ok=pick===q.a;
    after=`${q.script?`<details ${ok?'':'open'}><summary>${L('Lời thoại','Script')}</summary><div class="script">${esc(q.script)}</div></details>`:''}
     <div class="tiny" style="margin-top:10px">${esc(typeName(q))}${q.tag?' · '+esc(q.tag):''}</div>`;
  }
  const last=SS.i===SS.qs.length-1;
  let nav='';
  if(exam)nav=`<div class="navq"><button class="btn line" id="prev" ${SS.i?'':'disabled'}>${L('Câu trước','Previous')}</button>${last?`<button class="btn bee" id="submit">${L('Nộp bài','Submit')}</button>`:`<button class="btn" id="next">${L('Câu sau','Next')}</button>`}</div>
    <details><summary>${L('Phiếu trả lời','Answer sheet')}</summary><div class="sheet">${SS.qs.map((x,k)=>`<button data-go="${k}" class="${SS.picks[x.id]!=null?'done':''} ${k===SS.i?'cur':''}">${k+1}</button>`).join('')}</div></details>`;
  else if(shown)nav=`<div class="navq"><button class="btn bee" id="next">${last?L('Xem kết quả','See results'):L('Câu tiếp','Next')}</button></div>`;
  const verdict=shown?`<div class="verdict ${pick===q.a?'ok':'ng'}">${pick===q.a?I.ok+' '+L('Chính xác','Correct'):(pick==null?L('Chưa chọn','No answer'):L('Chưa đúng','Wrong'))+' · '+L('đáp án ','answer ')+(q.a+1)}</div>`:'';
  const qpane=`${q.audio?audioHTML(q):''}<div class="qmeta"><span class="pill">${esc(typeName(q))}</span></div>${stem}${verdict}<div class="opts">${opts}</div>${after}${nav}`;
  const bar=exam?`<div class="tbar" id="tbar"><i id="tfill"></i></div>`:'';
  full(`<div class="sbar"><button class="iconbtn" id="quit" aria-label="Quit">${SS.kind==='view'?I.back:I.x}</button><div class="ttl">${esc(SS.title)}</div><span class="pill" id="qn">${SS.i+1}/${SS.qs.length}</span></div>
   ${bar}<div class="pbar"><i style="width:${(SS.i+1)/SS.qs.length*100}%"></i></div>
   ${hasP?`<div class="split"><div class="pane-p" id="pp" style="--ph:${SS.ph||42}%">${passageHTML(ex,q)}</div><div class="grip" id="grip"><i></i></div><div class="pane-q" id="pq">${qpane}</div></div>`
         :`<div class="split"><div class="pane-q" id="pq">${qpane}</div></div>`}`);
  bindAudio(q);
  if(q.audio&&!shown&&exam&&SS.autoplayed!==q.id){SS.autoplayed=q.id;setTimeout(()=>playSeg(q,true),300)}
  // kéo thanh chia đôi
  const grip=$('#grip');if(grip){const pp=$('#pp'),sp=document.querySelector('.split');
    grip.onpointerdown=e=>{grip.setPointerCapture(e.pointerId);const r=sp.getBoundingClientRect();
      grip.onpointermove=m=>{const v=Math.min(78,Math.max(15,(m.clientY-r.top)/r.height*100));SS.ph=Math.round(v);pp.style.setProperty('--ph',v+'%')};
      grip.onpointerup=()=>{grip.onpointermove=null}}}
  if(SS.kind==='view')$('#quit').onclick=()=>{const b=SS.back;SS=null;resultScreen(b)};
  else $('#quit').onclick=()=>{if(exam&&!confirm(L('Thoát bài thi? Các câu đã chọn sẽ không được chấm.','Quit the test? Your answers will not be scored.')))return;SS=null;clearInterval(TIMER);render()};
  // chạm một lần để chọn, chạm lại để chốt
  $$('.opt').forEach(b=>b.onclick=()=>{if(shown)return;const k=+b.dataset.k;
    if(SS.picks[q.id]===k&&b.classList.contains('sel')){
      if(exam){if(!last){SS.i++;SS.qt=Date.now();renderSession()}else{b.classList.remove('sel');toast(L('Đã chọn. Bấm Nộp bài khi xong.','Chosen. Tap Submit when done.'))}}
      else check(q);
      return}
    SS.picks[q.id]=k;$$('.opt').forEach(o=>o.classList.toggle('sel',+o.dataset.k===k));
    const d=document.querySelector(`[data-go="${SS.i}"]`);if(d)d.classList.add('done')});
  const nx=$('#next');if(nx)nx.onclick=()=>{if(!exam&&last){if(SS.kind==='view')return;return finish()}SS.i++;SS.qt=Date.now();renderSession()};
  const pv=$('#prev');if(pv)pv.onclick=()=>{SS.i--;renderSession()};
  const gs=$('#guess');if(gs)gs.onclick=()=>{rate(q.id,1);const a=S.ans[q.id];if(a)a[a.length-1].g=1;save();toast(L('Đã cho vào ôn lại','Added to review'));gs.remove()};
  const sb=$('#submit');if(sb)sb.onclick=()=>{const left=SS.qs.filter(x=>SS.picks[x.id]==null).length;if(left&&!confirm(L(`Còn ${left} câu chưa chọn. Nộp bài?`,`${left} unanswered. Submit?`)))return;finish()};
  $$('[data-go]').forEach(b=>b.onclick=()=>{SS.i=+b.dataset.go;renderSession()});
  if(exam){let showNum=false;const tb=$('#tbar');
    const tick=()=>{const left=(SS.deadline-Date.now())/1000;const f=$('#tfill');if(f)f.style.width=Math.max(0,left/SS.total*100)+'%';if(tb)tb.classList.toggle('warn',left<300);
      const qn=$('#qn');if(qn)qn.textContent=showNum?fmtTime(left):`${SS.i+1}/${SS.qs.length}`;
      if(left<=0){clearInterval(TIMER);toast(L('Hết giờ','Time is up'));finish()}};
    if(tb)tb.onclick=()=>{showNum=!showNum;tick()};
    tick();TIMER=setInterval(tick,1000)}
  if(shown&&SS.justChecked){SS.justChecked=0;const v=document.querySelector('.verdict');if(v)v.scrollIntoView({behavior:'smooth',block:'start'})}
}
function check(q){
  const pick=SS.picks[q.id];SS.shown[q.id]=1;SS.justChecked=1;stopAudio();
  const ok=pick===q.a;record(q,ok,SS.kind,Date.now()-SS.qt);
  if(SS.kind==='review')rate(q.id,ok?3:1);else if(!ok)rate(q.id,1);else if(S.cards[q.id])rate(q.id,3);
  save();renderSession();
}
function finish(){
  clearInterval(TIMER);stopAudio();const s=SS;
  if(s.kind==='exam'){
    s.qs.forEach(q=>{const ok=s.picks[q.id]===q.a;record(q,ok,'exam',0);if(!ok)rate(q.id,1);else if(S.cards[q.id])rate(q.id,3)});
    const c=s.qs.filter(q=>s.picks[q.id]===q.a).length;
    (S.exams[s.ex.id]=S.exams[s.ex.id]||[]).push({at:Date.now(),name:s.part.name,c,n:s.qs.length,secs:Math.round((Date.now()-s.t0)/1000)});save();
  }
  s.qs.forEach(q=>s.shown[q.id]=1);SS=null;resultScreen(s);
}
function resultScreen(s){
  const c=s.qs.filter(q=>s.picks[q.id]===q.a).length, n=s.qs.length;
  const byM={};s.qs.forEach(q=>{const k=typeName(q);const o=byM[k]=byM[k]||{c:0,n:0};o.n++;if(s.picks[q.id]===q.a)o.c++});
  shell(`<div class="top"><button class="iconbtn" id="back" aria-label="Back">${I.back}</button><div class="tiny">${esc(s.title)}</div><span style="width:40px"></span></div>
   <div class="card center"><img class="mascot s" src="img/mark.webp" alt=""><div class="big" style="font-size:46px">${c}<span class="muted" style="font-size:22px"> / ${n}</span></div><div class="muted small">${Math.round(c/n*100)}% · ${fmtTime((Date.now()-s.t0)/1000)}</div></div>
   <div class="h">${L('Theo dạng câu','By question type')}</div><div class="card">${Object.entries(byM).map(([k,o])=>`<div class="list-item"><div class="grow" style="font-size:15px">${esc(k)}</div><div class="meter ${o.c/o.n<.6?'low':''}" style="max-width:110px"><i style="width:${o.c/o.n*100}%"></i></div><b style="min-width:44px;text-align:right">${o.c}/${o.n}</b></div>`).join('')}</div>
   <div class="h">${L('Xem lại từng câu','Review each question')}</div><div class="card">${s.qs.map((q,k)=>{const ok=s.picks[q.id]===q.a;return `<div class="list-item" data-rv="${k}" style="cursor:pointer"><span class="pill" style="color:${ok?'var(--ok)':'var(--ng)'}">${ok?'○':'×'}</span><div class="grow jp" style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(plain(q.q))}</div><span class="tiny">${s.picks[q.id]!=null?s.picks[q.id]+1:'–'} → ${q.a+1}</span></div>`}).join('')}</div>`,{tabs:false});
  $('#back').onclick=()=>{TAB='home';render()};
  $$('[data-rv]').forEach(b=>b.onclick=()=>{SS=Object.assign({},s,{kind:'view',i:+b.dataset.rv,back:s});renderSession()});
}

/* ---------- bộ thẻ (giống Anki) ---------- */
let ST=null; // {decks, cards}
async function ankiState(force){if(!window.ANKI)return {decks:[],cards:[]};if(ST&&!force)return ST;const [decks,cards]=await Promise.all([ANKI.all('decks'),ANKI.all('cards')]);ST={decks,cards};return ST}
const dropState=()=>{ST=null};
function dayEnd(){const d=new Date();const e=new Date(d);e.setHours(4,0,0,0);if(e<=d)e.setDate(e.getDate()+1);return e.getTime()}
function isDue(c,now,de){if(c.card.state===0)return false;const t=new Date(c.card.due).getTime();return c.card.state===2?t<=de:t<=now+20*60000}
function deckCfg(d){return Object.assign({ret:0.9,maxIvl:36500,newDay:0},d&&d.cfg||{})}
function deckIdsUnder(st,id){const d=st.decks.find(x=>x.id===id);if(!d)return new Set([id]);const pre=d.name+'::';return new Set(st.decks.filter(x=>x.id===id||x.name.startsWith(pre)).map(x=>x.id))}
function newToday(deckId){const k=new Date(dayEnd()-864e5).toDateString();const m=S.newDone||{};return m.day===k?(m[deckId]||0):0}
function markNew(deckId){const k=new Date(dayEnd()-864e5).toDateString();if(!S.newDone||S.newDone.day!==k)S.newDone={day:k};S.newDone[deckId]=(S.newDone[deckId]||0)+1;save()}
function ankiQueue(cards,deckSet,decks){
  const now=Date.now(),de=dayEnd();
  const mine=cards.filter(c=>!c.susp&&(!deckSet||deckSet.has(c.deck)));
  const due=mine.filter(c=>isDue(c,now,de)).sort((a,b)=>new Date(a.card.due)-new Date(b.card.due));
  let fresh=mine.filter(c=>c.card.state===0).sort((a,b)=>(a.ord||0)-(b.ord||0));
  if(decks){const byDeck={};fresh=fresh.filter(c=>{const d=decks.find(x=>x.id===c.deck);const lim=deckCfg(d).newDay;if(!lim)return true;byDeck[c.deck]=(byDeck[c.deck]||0)+1;return byDeck[c.deck]+newToday(c.deck)<=lim})}
  return {due,fresh};
}
function deckTree(st){
  // gom deck theo tên A::B::C, có cả deck cha không chứa thẻ
  const nodes={};const get=name=>nodes[name]||(nodes[name]={name,id:null,kids:[],cards:[]});
  st.decks.forEach(d=>{const n=get(d.name);n.id=d.id;n.deck=d;const parts=d.name.split('::');for(let i=1;i<parts.length;i++){const p=parts.slice(0,i).join('::'),c=parts.slice(0,i+1).join('::');const pn=get(p);if(!pn.kids.includes(c))pn.kids.push(c);get(c)}});
  const roots=Object.keys(nodes).filter(n=>!n.includes('::')).sort((a,b)=>a.localeCompare(b));
  Object.values(nodes).forEach(n=>n.kids.sort((a,b)=>a.localeCompare(b)));
  return {nodes,roots};
}
function nodeSet(st,tree,name){const s=new Set();const walk=n=>{const x=tree.nodes[n];if(x.id)s.add(x.id);x.kids.forEach(walk)};walk(name);return s}

function home(){
  const h=new Date().getHours();const hi=L(h<11?'Chào buổi sáng':h<18?'Chào buổi chiều':'Chào buổi tối',h<11?'Good morning':h<18?'Good afternoon':'Good evening');
  shell(`${header()}
  <div class="card hello"><img class="mascot" src="img/mark.webp" alt=""><div class="grow"><div style="font-size:20px;font-weight:800">${hi}${L(', anh Nhân',', Nhân')}</div><div class="tiny" id="hsub">&nbsp;</div></div></div>
  <div class="card" id="ankiBox"><div class="tiny">${L('Đang đọc thẻ…','Loading cards…')}</div></div>`);
  ankiBox();
}
async function ankiBox(){
  const box=$('#ankiBox');if(!box)return;
  let st;try{st=await ankiState()}catch(e){box.innerHTML=`<div class="muted small">${L('Trình duyệt chặn bộ nhớ, chưa dùng được phần thẻ.','The browser blocks storage, cards are unavailable.')}</div>`;return}
  if(!document.body.contains(box))return;
  const tree=deckTree(st);const tot=ankiQueue(st.cards,null,st.decks);
  const col=S.collapsed||{};
  const doneToday=S.revToday&&S.revToday.day===new Date(dayEnd()-864e5).toDateString()?S.revToday.n:0;
  const hs=$('#hsub');if(hs)hs.textContent=L(`Hôm nay đã ôn ${doneToday} thẻ`,`${doneToday} reviews today`);
  const row=(name,depth)=>{const n=tree.nodes[name];const set=nodeSet(st,tree,name);const q=ankiQueue(st.cards,set,st.decks);const kids=n.kids.length;const short=name.split('::').pop();
    let h=`<div class="deckrow" style="--d:${depth}">
      ${kids?`<button class="tw" data-tw="${esc(name)}" aria-label="${L('Mở/đóng','Toggle')}">${col[name]?'▸':'▾'}</button>`:'<span class="tw"></span>'}
      <button class="dn" data-study="${esc(name)}">${esc(short)}</button>
      <span class="dc due">${q.due.length||''}</span><span class="dc new">${q.fresh.length||''}</span>
      <button class="iconbtn sm" data-opt="${esc(name)}" aria-label="${L('Tùy chọn deck','Deck options')}">${I.dots}</button></div>`;
    if(kids&&!col[name])n.kids.forEach(k=>h+=row(k,depth+1));return h};
  box.innerHTML=`${st.cards.length?`<div class="row" style="align-items:flex-end"><div class="big grow">${tot.due.length}<span class="muted" style="font-size:15px"> ${L('thẻ đến hạn','due')} · ${tot.fresh.length} ${L('thẻ mới','new')}</span></div></div>
   <button class="btn bee" id="ankiAll" style="width:100%;margin:12px 0 10px;font-size:17px;padding:16px" ${tot.due.length+tot.fresh.length?'':'disabled'}>${tot.due.length?L(`Học ${tot.due.length} thẻ đến hạn`,`Study ${tot.due.length} due cards`):tot.fresh.length?L('Học thẻ mới','Learn new cards'):L('Xong hết rồi','All done')}</button>
   <div class="deckhead"><span class="grow">Deck</span><span class="dc due">${L('Đến hạn','Due')}</span><span class="dc new">${L('Mới','New')}</span><span style="width:34px"></span></div>
   <div class="decks">${tree.roots.map(r=>row(r,0)).join('')}</div>`
   :`<p class="muted small" style="margin:0 0 4px">${L('Chưa có thẻ nào.','No cards yet.')}</p>`}
   <div class="row wrapbtn" style="margin-top:14px"><button class="btn line" id="addC">${L('+ Thêm thẻ','+ Add cards')}</button><button class="btn line" id="newD">${L('Tạo deck','New deck')}</button><button class="btn line" id="ankiImp">${L('Nhập .apkg','Import .apkg')}</button></div>
   <div class="tiny" id="impMsg" style="margin-top:8px"></div>`;
  const a=$('#ankiAll');if(a)a.onclick=()=>startAnki(null,'due');
  $$('[data-tw]').forEach(b=>b.onclick=()=>{S.collapsed=S.collapsed||{};S.collapsed[b.dataset.tw]=!S.collapsed[b.dataset.tw];save();ankiBox()});
  $$('[data-study]').forEach(b=>b.onclick=()=>startAnki(nodeSet(st,tree,b.dataset.study),'mix',b.dataset.study.split('::').pop()));
  $$('[data-opt]').forEach(b=>b.onclick=()=>deckOptions(b.dataset.opt));
  $('#addC').onclick=()=>addCards();
  $('#newD').onclick=async()=>{const nm=prompt(L('Tên deck mới (dùng :: để làm deck con, ví dụ Grammar+::N3):','New deck name (use :: for subdecks):'));if(!nm||!nm.trim())return;
    if(st.decks.some(d=>d.name===nm.trim())){toast(L('Đã có deck này','Deck exists'));return}await ANKI.put('decks',{id:'d'+Date.now(),name:nm.trim(),at:Date.now()});dropState();ankiBox()};
  $('#ankiImp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.apkg,.colpkg';i.onchange=async()=>{const msg=$('#impMsg');
    try{const r=await ANKI.importApkg(i.files[0],t=>msg.textContent=t);msg.textContent=L(`Đã nhập ${r.cards} thẻ từ ${r.decks} deck, giữ nguyên lịch ôn.`,`Imported ${r.cards} cards from ${r.decks} decks.`);dropState();setTimeout(ankiBox,1500)}
    catch(e){msg.textContent=L('Không nhập được: ','Import failed: ')+e.message}};i.click()};
}

/* ---------- tùy chọn deck ---------- */
async function deckOptions(name){
  const st=await ankiState();const tree=deckTree(st);const node=tree.nodes[name];
  let d=node.deck;
  const set=nodeSet(st,tree,name);const cards=st.cards.filter(c=>set.has(c.deck));
  const v=document.createElement('div');v.className='veil';
  const close=()=>{v.remove();dropState();render()};
  const cfg=deckCfg(d);
  v.innerHTML=`<div class="panel">
   <div class="row" style="margin-bottom:14px"><div class="grow" style="font-weight:800;font-size:18px;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div><button class="iconbtn" id="ox">${I.x}</button></div>
   <div class="tiny">${cards.length} ${L('thẻ','cards')} · ${cards.filter(c=>c.card.state===0).length} ${L('mới','new')} · ${cards.filter(c=>c.susp).length} ${L('tạm ẩn','suspended')}</div>
   <label class="lab">${L('Tên deck','Deck name')}<input class="field" id="oname" value="${esc(name)}"></label>
   <label class="lab">${L('Tỉ lệ nhớ mong muốn','Desired retention')} <b id="oretv">${Math.round(cfg.ret*100)}%</b><input type="range" id="oret" min="70" max="97" value="${Math.round(cfg.ret*100)}"></label>
   <label class="lab">${L('Thẻ mới mỗi ngày (0 = không giới hạn)','New cards per day (0 = no limit)')}<input class="field" id="onew" type="number" min="0" value="${cfg.newDay}"></label>
   <label class="lab">${L('Khoảng cách ôn tối đa (ngày)','Maximum interval (days)')}<input class="field" id="omax" type="number" min="1" value="${cfg.maxIvl}"></label>
   <button class="btn bee" id="osave" style="width:100%;margin-top:14px">${L('Lưu','Save')}</button>
   <div class="row wrapbtn" style="margin-top:12px"><button class="btn line" id="obrowse">${L('Xem thẻ','Browse')}</button><button class="btn line" id="oadd">${L('Thêm thẻ','Add')}</button><button class="btn line" id="oexp">${L('Xuất file','Export')}</button><button class="btn line" id="odel" style="color:var(--ng)">${L('Xóa deck','Delete')}</button></div>
  </div>`;
  document.body.appendChild(v);v.onclick=e=>{if(e.target===v)close()};
  v.querySelector('#ox').onclick=close;
  v.querySelector('#oret').oninput=e=>v.querySelector('#oretv').textContent=e.target.value+'%';
  v.querySelector('#osave').onclick=async()=>{
    const nn=v.querySelector('#oname').value.trim();
    const c={ret:+v.querySelector('#oret').value/100,newDay:Math.max(0,+v.querySelector('#onew').value|0),maxIvl:Math.max(1,+v.querySelector('#omax').value|0)};
    if(!d){d={id:'d'+Date.now(),name,at:Date.now()}}
    d.cfg=c;
    if(nn&&nn!==name){ // đổi tên cả deck con
      const rows=st.decks.filter(x=>x.name===name||x.name.startsWith(name+'::'));rows.forEach(x=>x.name=nn+x.name.slice(name.length));await ANKI.putMany('decks',rows)}
    await ANKI.put('decks',d);toast(L('Đã lưu','Saved'));close()};
  v.querySelector('#obrowse').onclick=()=>{v.remove();TAB='browse';BR.q=`deck:"${name}"`;render()};
  v.querySelector('#oadd').onclick=()=>{v.remove();addCards(d&&d.id)};
  v.querySelector('#oexp').onclick=()=>exportDeck(name,cards);
  v.querySelector('#odel').onclick=async()=>{if(!confirm(L(`Xóa deck "${name}" và ${cards.length} thẻ trong đó? Không hoàn tác được.`,`Delete "${name}" and its ${cards.length} cards? This cannot be undone.`)))return;
    for(const id of set)await ANKI.delDeck(id);
    const rows=st.decks.filter(x=>x.name.startsWith(name+'::'));for(const x of rows)await ANKI.delDeck(x.id);close()};
}
function stripHtml(s){return String(s||'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')}
function isSimple(c){return c.fl&&c.fl.length>=2&&(c.edited||String(c.front).trim()===String(c.fl[0]).trim())}
function fieldsOf(c){if(isSimple(c))return [c.fl[0],c.fl.slice(1).join('<br>')];const parts=String(c.back).split(/<hr id=["']?answer["']?\s*\/?>/i);return [c.front,parts.slice(1).join('')]}
function exportDeck(name,cards){
  const rows=cards.map(c=>{const [f,b]=fieldsOf(c);return [c.guid||c.id,f,b,c.tags||''].map(x=>String(x).replace(/[\t\n\r]/g,' ')).join('\t')});
  const txt=`#separator:tab\n#html:true\n#guid column:1\n#tags column:4\n#deck:${name}\n`+rows.join('\n')+'\n';
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));a.download=name.replace(/[:\\/]+/g,'_')+'.txt';a.click();
  toast(L(`Đã xuất ${rows.length} thẻ`,`Exported ${rows.length} cards`));
}

/* ---------- thêm thẻ (dán) ---------- */
const newGuid=()=>{const a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';let s='';for(let i=0;i<10;i++)s+=a[Math.floor(Math.random()*a.length)];return s};
function makeCard(deck,front,back,tags){const id='n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  return {id,deck,guid:newGuid(),fl:[front,back],front,back:front+'<hr id=answer>'+back,tags:tags||'',appAt:0,created:Date.now(),
    card:{due:new Date(),stability:0,difficulty:0,elapsed_days:0,scheduled_days:0,reps:0,lapses:0,state:0,learning_steps:0}}}
function parsePaste(txt,defDeck,decks){
  let deckName=null;const out=[];
  txt.split(/\r?\n/).forEach(line=>{if(!line.trim())return;
    const m=line.match(/^#deck:\s*(.+)$/i);if(m){deckName=m[1].trim();return}
    if(line.startsWith('#'))return;
    const i=line.indexOf('\t');if(i<0)return out.push({err:line});
    out.push({front:line.slice(0,i).trim(),back:line.slice(i+1).trim()})});
  return {deckName,rows:out};
}
async function addCards(deckId){
  const st=await ankiState();
  const decks=st.decks.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const voc=decks.find(d=>d.name==='Vocabulary');const def=deckId||S.lastDeck||(voc||decks[0]||{}).id;
  const v=document.createElement('div');v.className='veil';
  v.innerHTML=`<div class="panel wide">
   <div class="row" style="margin-bottom:10px"><div class="grow" style="font-weight:800;font-size:18px">${L('Thêm thẻ','Add cards')}</div><button class="iconbtn" id="ax">${I.x}</button></div>
   <div class="seg" style="margin-bottom:12px"><button data-am="paste" class="on">${L('Dán nhiều thẻ','Paste many')}</button><button data-am="one">${L('Từng thẻ','One card')}</button></div>
   <label class="lab">Deck<select class="field" id="adeck">${decks.map(d=>`<option value="${esc(d.id)}" ${d.id===def?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
   <div id="apaste"><label class="lab">${L('Dán các dòng Mặt trước⇥Mặt sau (HTML được). Dòng #deck:Tên đổi deck.','Paste lines Front⇥Back (HTML ok). A #deck:Name line picks the deck.')}<textarea class="field mono" id="atxt" rows="8" placeholder="氷室&#9;ひむろ&lt;br&gt;&lt;br&gt;BĂNG THẤT…"></textarea></label>
     <label class="chk"><input type="checkbox" id="aover"> ${L('Thẻ trùng mặt trước: ghi đè mặt sau (giữ lịch ôn)','Duplicate front: overwrite back (keep schedule)')}</label>
     <div class="tiny" id="ainfo" style="margin-top:6px"></div></div>
   <div id="aone" style="display:none"><label class="lab">${L('Mặt trước','Front')}<textarea class="field" id="af" rows="2"></textarea></label><label class="lab">${L('Mặt sau','Back')}<textarea class="field" id="ab" rows="5"></textarea></label><label class="lab">Tags<input class="field" id="at"></label></div>
   <button class="btn bee" id="ago" style="width:100%;margin-top:14px">${L('Thêm','Add')}</button></div>`;
  document.body.appendChild(v);
  let mode='paste';
  const close=()=>{v.remove();dropState();render()};
  v.querySelector('#ax').onclick=close;
  v.querySelectorAll('[data-am]').forEach(b=>b.onclick=()=>{mode=b.dataset.am;v.querySelectorAll('[data-am]').forEach(x=>x.classList.toggle('on',x===b));v.querySelector('#apaste').style.display=mode==='paste'?'':'none';v.querySelector('#aone').style.display=mode==='one'?'':'none'});
  const info=()=>{const r=parsePaste(v.querySelector('#atxt').value);const ok=r.rows.filter(x=>!x.err).length,bad=r.rows.length-ok;
    v.querySelector('#ainfo').textContent=ok||bad?L(`${ok} thẻ hợp lệ${bad?`, ${bad} dòng thiếu dấu tab`:''}${r.deckName?` · vào deck ${r.deckName}`:''}`,`${ok} cards${bad?`, ${bad} lines without a tab`:''}${r.deckName?` · into ${r.deckName}`:''}`):''};
  v.querySelector('#atxt').oninput=info;
  v.querySelector('#ago').onclick=async()=>{
    let deck=v.querySelector('#adeck').value;S.lastDeck=deck;save();
    const all=(await ankiState(true)).cards;
    if(mode==='one'){const f=v.querySelector('#af').value.trim(),b=v.querySelector('#ab').value.trim();if(!f)return;
      await ANKI.put('cards',makeCard(deck,f,b,v.querySelector('#at').value.trim()));toast(L('Đã thêm 1 thẻ','Added 1 card'));v.querySelector('#af').value='';v.querySelector('#ab').value='';v.querySelector('#af').focus();dropState();return}
    const r=parsePaste(v.querySelector('#atxt').value);
    if(r.deckName){let d=(await ANKI.all('decks')).find(x=>x.name===r.deckName);if(!d){d={id:'d'+Date.now(),name:r.deckName,at:Date.now()};await ANKI.put('decks',d)}deck=d.id}
    const byFront={};all.filter(c=>c.deck===deck).forEach(c=>byFront[stripHtml(fieldsOf(c)[0]).trim()]=c);
    const over=v.querySelector('#aover').checked;const add=[],upd=[];let dup=0;const seen=new Set();
    r.rows.filter(x=>!x.err).forEach(x=>{const k=stripHtml(x.front).trim();if(seen.has(k))return;seen.add(k);const ex=byFront[k];
      if(ex){if(over){ex.fl=[x.front,x.back];ex.front=x.front;ex.back=x.front+'<hr id=answer>'+x.back;ex.edited=1;upd.push(ex)}else dup++}else add.push(makeCard(deck,x.front,x.back))});
    if(add.length)await ANKI.putMany('cards',add);if(upd.length)await ANKI.putMany('cards',upd);
    toast(L(`Đã thêm ${add.length} thẻ${upd.length?`, cập nhật ${upd.length}`:''}${dup?`, bỏ qua ${dup} thẻ trùng`:''}`,`Added ${add.length}${upd.length?`, updated ${upd.length}`:''}${dup?`, skipped ${dup} duplicates`:''}`));
    close()};
}

/* ---------- duyệt thẻ ---------- */
const BR={q:'',sel:null,lim:200};
function matchCard(c,q,deckName){
  const toks=q.match(/(\w+:"[^"]*"|\w+:\S+|"[^"]*"|\S+)/g)||[];
  const txt=(stripHtml(c.front)+' '+stripHtml(c.back)+' '+(c.tags||'')).toLowerCase();
  return toks.every(t=>{let neg=false;if(t[0]==='-'){neg=true;t=t.slice(1)}let ok;
    const m=t.match(/^(\w+):"?([^"]*)"?$/);
    if(m&&['deck','is','tag'].includes(m[1])){const k=m[1],val=m[2].toLowerCase();
      if(k==='deck'){const dn=(deckName[c.deck]||'').toLowerCase();ok=dn===val||dn.startsWith(val+'::')||(val.endsWith('*')&&dn.startsWith(val.slice(0,-1)))}
      else if(k==='tag')ok=(c.tags||'').toLowerCase().split(/\s+/).includes(val);
      else ok=val==='new'?c.card.state===0:val==='due'?isDue(c,Date.now(),dayEnd()):val==='suspended'?!!c.susp:val==='learn'?(c.card.state===1||c.card.state===3):val==='review'?c.card.state===2:true}
    else ok=txt.includes(t.replace(/"/g,'').toLowerCase());
    return neg?!ok:ok});
}
async function browse(){
  shell(`${header()}<div class="browse"><div class="blist card">
    <input class="field" id="bq" placeholder="${L('Tìm: chữ, deck:"Grammar+::N3", is:new, is:due, is:suspended, tag:x','Search: text, deck:"Name", is:new, is:due, is:suspended, tag:x')}" value="${esc(BR.q)}">
    <div class="row" style="margin:10px 0 4px"><div class="tiny grow" id="bcount"></div><button class="btn line sm" id="badd">${L('+ Thêm','+ Add')}</button></div>
    <div id="brows"></div></div><div class="bedit card" id="bedit"><div class="tiny">${L('Chọn một thẻ để xem và sửa.','Pick a card to view and edit.')}</div></div></div>`);
  const st=await ankiState();const deckName={};st.decks.forEach(d=>deckName[d.id]=d.name);
  const draw=()=>{const bq=$('#bq');if(bq)BR.q=bq.value;const q=BR.q.trim();const list=q?st.cards.filter(c=>matchCard(c,q,deckName)):st.cards;
    const el=$('#brows');if(!el)return;
    $('#bcount').textContent=L(`${list.length} thẻ`,`${list.length} cards`)+(list.length>BR.lim?L(` · hiện ${BR.lim} thẻ đầu`,` · showing first ${BR.lim}`):'');
    el.innerHTML=list.slice(0,BR.lim).map(c=>{const [f,b]=fieldsOf(c);const due=c.card.state===0?L('mới','new'):new Date(c.card.due).toLocaleDateString(L('vi-VN','en-GB'));
      return `<button class="brow ${BR.sel===c.id?'on':''} ${c.susp?'susp':''}" data-id="${esc(c.id)}"><span class="bf jp">${esc(stripHtml(f).slice(0,60))}</span><span class="bb">${esc(stripHtml(b).slice(0,80))}</span><span class="tiny">${esc(deckName[c.deck]||'')} · ${due}</span></button>`}).join('')+(list.length>BR.lim?`<button class="btn line" id="bmore" style="width:100%;margin-top:8px">${L('Hiện thêm','Show more')}</button>`:'');
    $$('.brow').forEach(b=>b.onclick=()=>{BR.sel=b.dataset.id;$$('.brow').forEach(x=>x.classList.toggle('on',x===b));editCard(st.cards.find(c=>c.id===BR.sel),st,()=>{dropState();browse()})});
    const mo=$('#bmore');if(mo)mo.onclick=()=>{BR.lim+=300;draw()}};
  let t=null;$('#bq').oninput=e=>{BR.q=e.target.value;BR.lim=200;clearTimeout(t);t=setTimeout(draw,180)};
  $('#badd').onclick=()=>addCards();
  draw();
  if(BR.sel){const c=st.cards.find(x=>x.id===BR.sel);if(c)editCard(c,st,()=>{dropState();browse()},true)}
}
async function editCard(c,st,done,quiet){
  const box=$('#bedit');if(!box||!c)return;
  const [f,b]=fieldsOf(c);const decks=st.decks.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const rev=await ANKI.getRev(c.id);const logs=rev?rev.logs:[];
  const k=c.card;const stName=[L('Mới','New'),L('Đang học','Learning'),L('Ôn','Review'),L('Học lại','Relearning')][k.state]||'';
  box.innerHTML=`<div class="row" style="margin-bottom:8px"><div class="grow" style="font-weight:800">${L('Sửa thẻ','Edit card')}</div><button class="iconbtn sm mob" id="eclose">${I.x}</button></div>
   <label class="lab">Deck<select class="field" id="edeck">${decks.map(d=>`<option value="${esc(d.id)}" ${d.id===c.deck?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
   <label class="lab">${L('Mặt trước (HTML)','Front (HTML)')}<textarea class="field mono" id="ef" rows="3">${esc(f)}</textarea></label>
   <label class="lab">${L('Mặt sau (HTML)','Back (HTML)')}<textarea class="field mono" id="eb" rows="8">${esc(b)}</textarea></label>
   <label class="lab">Tags<input class="field" id="etag" value="${esc(c.tags||'')}"></label>
   <div class="row wrapbtn" style="margin-top:12px"><button class="btn bee" id="esave">${L('Lưu','Save')}</button><button class="btn line" id="esusp">${c.susp?L('Bỏ tạm ẩn','Unsuspend'):L('Tạm ẩn','Suspend')}</button><button class="btn line" id="eforget">${L('Học lại từ đầu','Reset')}</button><button class="btn line" id="edel" style="color:var(--ng)">${L('Xóa','Delete')}</button></div>
   <div class="h">${L('Xem trước','Preview')}</div><div class="preview jp" id="eprev">${backHTML(c)}</div>
   <div class="h">${L('Thông tin','Info')}</div>
   <div class="tiny">${stName} · ${L('đến hạn','due')} ${k.state===0?'—':new Date(k.due).toLocaleString(L('vi-VN','en-GB'))} · ${L('khoảng cách','interval')} ${k.scheduled_days||0} ${L('ngày','d')} · ${L('độ ổn định','stability')} ${(+k.stability||0).toFixed(1)} · ${L('ôn','reviews')} ${k.reps||0} · ${L('quên','lapses')} ${k.lapses||0}</div>
   ${logs.length?`<div class="revlog">${logs.slice(-30).reverse().map(l=>`<div><span>${new Date(l[0]).toLocaleString(L('vi-VN','en-GB'))}</span><b class="${l[1]===1?'ng':'okc'}">${l[1]===1?L('Quên','Again'):l[1]===2?L('Khó','Hard'):l[1]===3?L('Nhớ','Good'):L('Dễ','Easy')}</b><span>${l[2]>0?l[2]+L(' ngày','d'):''}</span></div>`).join('')}</div>`:''}`;
  ANKI.hydrate($('#eprev'));
  document.body.classList.add('editing');
  if(!quiet&&window.innerWidth<900)box.scrollIntoView({behavior:'smooth'});
  $('#eclose').onclick=()=>{document.body.classList.remove('editing');BR.sel=null;$$('.brow.on').forEach(x=>x.classList.remove('on'))};
  const upd=async(ch)=>{Object.assign(c,ch);c.edited=1;await ANKI.put('cards',c);toast(L('Đã lưu','Saved'));done()};
  $('#esave').onclick=()=>{const nf=$('#ef').value,nb=$('#eb').value;
    upd({deck:$('#edeck').value,tags:$('#etag').value.trim(),fl:isSimple(c)?[nf,nb].concat(c.fl.slice(2)):c.fl,front:nf,back:nf+'<hr id=answer>'+nb})};
  $('#esusp').onclick=()=>upd({susp:c.susp?0:1});
  $('#eforget').onclick=()=>{if(confirm(L('Đưa thẻ này về thẻ mới?','Reset this card to new?')))upd({card:{due:new Date(),stability:0,difficulty:0,elapsed_days:0,scheduled_days:0,reps:0,lapses:0,state:0,learning_steps:0},appAt:Date.now()})};
  $('#edel').onclick=async()=>{if(!confirm(L('Xóa thẻ này?','Delete this card?')))return;await ANKI.del('cards',c.id);BR.sel=null;toast(L('Đã xóa','Deleted'));done()};
}

/* ---------- học ---------- */
function startAnki(deckSet,mode,title){
  ankiState().then(st=>{
    const q=ankiQueue(st.cards,deckSet,st.decks);
    let list;
    if(mode==='due'&&q.due.length)list=q.due.slice();
    else{list=[];const d=q.due.slice(),f=q.fresh.slice();while(d.length||f.length){for(let k=0;k<4&&d.length;k++)list.push(d.shift());if(f.length)list.push(f.shift())}}
    if(!list.length){toast(L('Deck này hết thẻ để học hôm nay','Nothing left in this deck today'));return}
    AK={list,i:0,show:false,a:0,g:0,hist:[],title:title||'',decks:st.decks};render();
  });
}
function backHTML(it){
  const parts=String(it.back).split(/<hr id=["']?answer["']?\s*\/?>/i);
  if(parts.length<2)return it.back;
  const ans=parts.slice(1).join('').replace(/^(\s*<br\s*\/?>)+/i,'').replace(/(<br\s*\/?>\s*){3,}/gi,'<br><br>');
  return `<div class="q">${parts[0]}</div><hr><div class="ans">${ans}</div>`;
}
function reviveA(c){const o=Object.assign({},c);o.due=new Date(c.due);if(c.last_review)o.last_review=new Date(c.last_review);return o}
const FS={};
function fsFor(deckId,decks){const cfg=deckCfg((decks||[]).find(d=>d.id===deckId));const k=cfg.ret+'|'+cfg.maxIvl;
  return FS[k]||(FS[k]=FSRS.fsrs(FSRS.generatorParameters({request_retention:cfg.ret,maximum_interval:cfg.maxIvl,enable_fuzz:true})))}
function bumpToday(d){const k=new Date(dayEnd()-864e5).toDateString();if(!S.revToday||S.revToday.day!==k)S.revToday={day:k,n:0};S.revToday.n+=d;save()}
function renderAnki(){
  const it=AK.list[AK.i];
  if(!it){dropState();shell(`<div class="card center" style="margin-top:40px"><img class="mascot" src="img/mark.webp" alt=""><div style="font-size:22px;font-weight:800">${L('Xong rồi!','All done!')}</div><p class="muted">${L(`Xong ${AK.a+AK.g} lượt: ${AK.g} nhớ, ${AK.a} quên.`,`${AK.a+AK.g} reviews: ${AK.g} remembered, ${AK.a} forgot.`)}</p><button class="btn bee" id="akb">${L('Về','Back')}</button></div>`,{tabs:false});$('#akb').onclick=()=>{AK=null;TAB='home';render()};return}
  const left=AK.list.length-AK.i;
  full(`<div class="sbar"><button class="iconbtn" id="akq" aria-label="Stop">${I.x}</button><div class="ttl">${AK.title?esc(AK.title)+' · ':''}${L(`Còn ${left} thẻ`,`${left} left`)}${it.card.state===0?L(' · thẻ mới',' · new'):''}</div><button class="iconbtn" id="akedit" aria-label="Edit">${I.pen}</button><button class="iconbtn" id="akundo" aria-label="Undo" ${AK.hist.length?'':'disabled style="opacity:.35"'}>${I.undo}</button></div>
   <div class="dstat"><span class="a">${L('Quên','Forgot')} ${AK.a}</span><span class="g">${L('Nhớ','Remembered')} ${AK.g}</span></div>
   <div class="deckwrap"><div class="stage" id="stage"><div class="fc" id="fc"><div class="face front">${it.front}</div><div class="face back">${backHTML(it)}</div></div>
     <div class="zone l">← ${L('Quên','Forgot')}</div><div class="zone r">${L('Nhớ','Remembered')} →</div></div>
     <div class="tiny center" style="margin-top:10px" id="akhint">${L('Chạm thẻ để lật','Tap the card to flip')}<span class="desk"> · ${L('phím cách','space')}</span></div></div>`);
  ANKI.hydrate($('#fc'));
  $('#akq').onclick=()=>{AK=null;dropState();TAB='home';render()};
  $('#akundo').onclick=undoAnki;
  $('#akedit').onclick=async()=>{const st=await ankiState();BR.sel=it.id;BR.q='';AK=null;TAB='browse';render()};
  const fc=$('#fc'),stage=$('#stage');
  let busy=false;
  const flip=()=>{AK.show=true;fc.classList.add('flip');stage.classList.add('shown');$('#akhint').innerHTML=L('Chạm nửa phải hoặc vuốt phải = Nhớ · nửa trái hoặc vuốt trái = Quên','Right half or swipe right = Remembered · left half or swipe left = Forgot')+`<span class="desk"> · ${L('phím 1 = Quên, phím 2 hoặc cách = Nhớ','key 1 = Forgot, 2 or space = Remembered')}</span>`};
  const grade=async(g)=>{if(busy)return;busy=true;fc.style.transform='';fc.classList.add(g===3?'fly-r':'fly-l');
    const prev=JSON.parse(JSON.stringify(it));const pos=AK.i;const was=it.card.state;
    if(hasF){it.card=fsFor(it.deck,AK.decks).repeat(reviveA(it.card),new Date())[g].card}
    it.appAt=Date.now();
    try{await ANKI.put('cards',it);await ANKI.logReview(it.id,[Date.now(),g,it.card.state===2?it.card.scheduled_days:0,was,0])}catch(e){toast(L('Không lưu được thẻ','Could not save the card'))}
    if(was===0)markNew(it.deck);
    if(g===1)AK.a++;else AK.g++;bumpToday(1);
    AK.hist.push({pos,prev,g,len:AK.list.length,was});
    if(new Date(it.card.due)-Date.now()<20*60000)AK.list.push(it);
    setTimeout(()=>{AK.i++;AK.show=false;renderAnki()},230)};
  let sx=0,sy=0,dx=0,drag=false,moved=false;
  fc.addEventListener('pointerdown',e=>{if(e.target.closest('a,button,input,textarea,select'))return;sx=e.clientX;sy=e.clientY;dx=0;drag=true;moved=false;fc.style.transition='none'});
  fc.addEventListener('pointermove',e=>{if(!drag||!AK.show)return;dx=e.clientX-sx;if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(e.clientY-sy))moved=true;
    if(moved){fc.style.transform=`translateX(${dx}px) rotate(${dx/22}deg) rotateY(180deg)`;fc.classList.toggle('tint-r',dx>40);fc.classList.toggle('tint-l',dx<-40)}});
  const end=e=>{if(!drag)return;drag=false;fc.style.transition='';fc.classList.remove('tint-r','tint-l');
    if(!AK.show){if(Math.abs(e.clientX-sx)<12&&Math.abs(e.clientY-sy)<12)flip();return}
    if(moved){if(dx>70)return grade(3);if(dx<-70)return grade(1);fc.style.transform='';return}
    if(Math.abs(e.clientY-sy)>12)return; // đang cuộn mặt sau
    const r=stage.getBoundingClientRect();grade(e.clientX>r.left+r.width/2?3:1)};
  fc.addEventListener('pointerup',end);fc.addEventListener('pointercancel',()=>{drag=false;fc.style.transform='';fc.style.transition=''});
  AK.key=e=>{if(e.target.closest&&e.target.closest('input,textarea,select'))return;
    if(!AK.show){if(e.key===' '||e.key==='Enter'){e.preventDefault();flip()}}
    else if(e.key==='ArrowRight'||e.key==='2'||e.key==='3'||e.key===' '||e.key==='Enter'){e.preventDefault();grade(3)}
    else if(e.key==='ArrowLeft'||e.key==='1'){e.preventDefault();grade(1)}
    if((e.key==='z'&&(e.ctrlKey||e.metaKey))||e.key==='Backspace'){e.preventDefault();undoAnki()}};
}
async function undoAnki(){
  const h=AK.hist.pop();if(!h)return;
  AK.list.length=h.len;AK.list[h.pos]=h.prev;AK.i=h.pos;AK.show=false;
  if(h.g===1)AK.a--;else AK.g--;bumpToday(-1);
  if(h.was===0&&S.newDone&&S.newDone[h.prev.deck])S.newDone[h.prev.deck]--;
  try{await ANKI.put('cards',h.prev);const r=await ANKI.getRev(h.prev.id);if(r){r.logs.pop();await ANKI.put('revlog',r)}}catch(e){}
  renderAnki();
}
document.addEventListener('keydown',e=>{if(AK&&AK.key)AK.key(e)});

/* ---------- điểm yếu ---------- */
function stats(){
  const rows={};const tags={};
  Object.entries(S.ans).forEach(([id,a])=>{const x=QI[id];if(!x)return;const q=x.q;
    const k=secName(q.sec)+' · '+typeName(q);const r=rows[k]=rows[k]||{c:0,n:0,o:q.no};
    a.forEach(e=>{r.n++;if(e.ok&&!e.g)r.c++});
    const l=a[a.length-1];if(!l.ok||l.g){tags[q.tag]=tags[q.tag]||[];tags[q.tag].push(q)}});
  const list=Object.entries(rows).sort((a,b)=>a[1].o-b[1].o);
  const weak=Object.entries(rows).filter(([k,r])=>r.n>=2).sort((a,b)=>a[1].c/a[1].n-b[1].c/b[1].n).slice(0,3);
  shell(`${header()}
  ${weak.length?`<div class="card"><div class="tiny">${L('Yếu nhất hiện tại','Weakest right now')}</div>${weak.map(([k,r])=>`<div class="row" style="margin-top:8px"><div class="grow" style="font-size:16px">${esc(k)}</div><b style="color:var(--ng)">${Math.round(r.c/r.n*100)}%</b></div>`).join('')}</div>`:''}
  <div class="h">${L('Tỉ lệ đúng theo dạng câu','Accuracy by question type')}</div>
  <div class="card">${list.length?list.map(([k,r])=>`<div class="list-item"><div class="grow" style="font-size:15px">${esc(k)}</div><div class="meter ${r.c/r.n<.6?'low':''}" style="max-width:100px"><i style="width:${r.c/r.n*100}%"></i></div><b style="min-width:48px;text-align:right">${r.c}/${r.n}</b></div>`).join(''):`<div class="empty"><img class="mascot s" src="img/mark.webp" alt="">${L('Làm vài câu là ở đây có số liệu.','Answer a few questions to see numbers here.')}</div>`}</div>
  <div class="h">${L('Điểm ngữ pháp, từ vựng đang sai','Grammar and words you keep missing')}</div>
  <div class="card">${Object.keys(tags).length?`<div class="row" style="flex-wrap:wrap;gap:8px">${Object.keys(tags).map(t=>`<span class="chip jp">${esc(t)}</span>`).join('')}</div>`:`<div class="tiny">${L('Chưa có.','None yet.')}</div>`}</div>
  <div class="h">${L('Dữ liệu','Data')}</div>
  <div class="card"><div class="row"><button class="btn line" id="exp">${L('Sao lưu','Back up')}</button><button class="btn line" id="imp">${L('Khôi phục','Restore')}</button></div><p class="tiny" style="margin:10px 0 0">${L('Tiến độ lưu trong máy này. Sao lưu ra file để chuyển máy.','Progress is stored on this device. Back up to a file to move devices.')}</p></div>`);
  $('#exp').onclick=()=>{const b=new Blob([JSON.stringify(S)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='shiratama-saoluu-'+new Date().toISOString().slice(0,10)+'.json';a.click()};
  $('#imp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=async()=>{try{const d=JSON.parse(await i.files[0].text());if(!d.ans)throw 0;S=Object.assign(structuredClone(DEF),d);save();toast(L('Đã khôi phục','Restored'));render()}catch(e){toast(L('File không hợp lệ','Invalid file'))}};i.click()};
}

/* ---------- bộ thẻ dựng sẵn ---------- */
async function openBundle(code){
  if(!window.ANKI)return;
  try{const r=await ANKI.loadBundle(code,t=>{ensureSky();$('#app').innerHTML=`<div class="wrap"><div class="card center" style="margin-top:30vh"><img class="mascot s" src="img/mark.webp" alt=""><div class="small muted">${esc(t)}</div></div></div>`});
    if(r){dropState();setTimeout(()=>toast(L(`Đã nạp ${r.cards} thẻ cùng lịch sử học`,`Loaded ${r.cards} cards with history`)),300)}}
  catch(e){console.warn(e);setTimeout(()=>toast(L('Chưa nạp được bộ thẻ','Could not load the card collection')),300)}
}
/* ---------- boot ---------- */
(async()=>{
  const c=ls.get('shiratama-code',null);
  if(c){try{DATA=await loadContent(c);indexData()}catch(e){DATA=null}}
  if(DATA)await openBundle(c);
  render();
})();
})();
