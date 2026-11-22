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
const SEC={moji:'文字・語彙',bunpou:'文法',dokkai:'読解',choukai:'聴解'};
const SEC_VI={moji:'Chữ Hán & từ vựng',bunpou:'Ngữ pháp',dokkai:'Đọc hiểu',choukai:'Nghe hiểu'};
const SEC_ICO={moji:['字','b'],bunpou:['文','y'],dokkai:['読','l'],choukai:['聴','p']};
const SIZES=[17,19,21,23,25];

/* ---------- state ---------- */
const KEY='shiratama-v1';
const DEF={v:1,ans:{},cards:{},exams:{},theme:'auto',mode:'auto',size:2};
let S=Object.assign(structuredClone(DEF),ls.get(KEY,{}));
if(S.size==null)S.size=2; if(!S.mode)S.mode='auto';
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
function applyLook(){const r=document.documentElement;r.setAttribute('data-mode',isNight()?'night':'day');r.style.setProperty('--jp-size',SIZES[S.size]+'px');
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
  ok:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>'
};

/* ---------- audio ---------- */
let AU=null,AUQ=null,AUTick=null;
function stopAudio(){if(AU)AU.pause();clearInterval(AUTick);AUQ=null;const b=$('#aubtn');if(b)b.innerHTML=I.play}
function playSeg(q,restart){
  if(!AU){AU=new Audio();AU.preload='auto'}
  const [a,b]=q.t;
  const go=()=>{if(restart||AU.currentTime<a||AU.currentTime>=b-0.2)AU.currentTime=a;AU.play().catch(()=>toast('Không phát được âm thanh'))};
  if(AU.dataset.src!==q.audio){AU.src=q.audio;AU.dataset.src=q.audio;AU.addEventListener('loadedmetadata',go,{once:true});AU.load()}else go();
  AUQ=q.id;const bt=$('#aubtn');if(bt)bt.innerHTML=I.pause;
  clearInterval(AUTick);AUTick=setInterval(()=>{
    const tr=$('#autrack');if(tr)tr.style.width=Math.min(100,Math.max(0,(AU.currentTime-a)/(b-a)*100))+'%';
    const tt=$('#autime');if(tt)tt.textContent=fmtTime(AU.currentTime-a)+' / '+fmtTime(b-a);
    if(AU.currentTime>=b){AU.pause();stopAudio()}
  },200);
}
function audioHTML(q){return `<div class="audio"><button class="play" id="aubtn" aria-label="Phát">${I.play}</button><div class="track"><i id="autrack"></i></div><span class="tiny" id="autime">0:00 / ${fmtTime(q.t[1]-q.t[0])}</span><button class="again" id="aurestart" aria-label="Nghe lại">${I.again}</button></div>`}
function bindAudio(q){const b=$('#aubtn');if(!b)return;b.onclick=()=>{if(AUQ===q.id&&!AU.paused){AU.pause();b.innerHTML=I.play}else playSeg(q)};$('#aurestart').onclick=()=>playSeg(q,true)}

/* ---------- khung ---------- */
const SKY=`<div class="sky"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="b5"></i>
<svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">${Array.from({length:70},(_,k)=>{const x=(k*97)%400,y=(k*173)%800,r=(k%5===0)?1.6:(k%3===0?1.1:.7);return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${.35+(k%4)*.15}"/>`}).join('')}</svg></div>`;
function ensureSky(){if(!document.querySelector('.sky'))document.body.insertAdjacentHTML('afterbegin',SKY)}
function shell(inner,{tabs=true}={}){
  ensureSky();
  $('#app').innerHTML=`<div class="wrap">${inner}</div>`+(tabs?`<nav class="tabs">
   ${[['home','札','Học thẻ'],['exam','試','Luyện đề'],['stats','析','Tiến độ']].map(([k,j,v])=>`<button data-tab="${k}" class="${TAB===k?'on':''}"><b>${j}</b>${v}</button>`).join('')}</nav>`:'');
  $$('[data-tab]').forEach(b=>b.onclick=()=>{TAB=b.dataset.tab;render()});
  const g=$('#gear');if(g)g.onclick=settings;
  window.scrollTo(0,0);
}
function full(inner){ensureSky();$('#app').innerHTML=`<div class="sess">${inner}</div>`}
function header(){return `<div class="top"><div class="brand"><img class="mark" src="img/mark.webp" alt=""><div>${APP}<small>白玉</small></div></div><button class="iconbtn" id="gear" aria-label="Cài đặt">${I.gear}</button></div>`}

function settings(){
  const v=document.createElement('div');v.className='veil';
  const draw=()=>{v.innerHTML=`<div class="panel">
    <div class="row" style="margin-bottom:14px"><div class="grow" style="font-weight:800;font-size:18px">Cài đặt</div><button class="iconbtn" id="sx" aria-label="Đóng">${I.x}</button></div>
    <div class="tiny" style="margin:0 2px 6px">Giao diện</div>
    <div class="seg" id="smode">${[['auto','Theo giờ'],['day','Ban ngày'],['night','Ban đêm']].map(([k,l])=>`<button data-m="${k}" class="${S.mode===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="tiny" style="margin:6px 2px 16px">Theo giờ: trời sao từ 18:00 đến 6:00.</div>
    <div class="tiny" style="margin:0 2px 6px">Cỡ chữ tiếng Nhật</div>
    <div class="row"><button class="btn line" id="sm" ${S.size?'':'disabled'}>A−</button><div class="grow center jp" style="font-size:${SIZES[S.size]}px">日本語の勉強</div><button class="btn line" id="sp" ${S.size<SIZES.length-1?'':'disabled'}>A+</button></div>
  </div>`;
    v.querySelector('#sx').onclick=()=>{v.remove();render()};
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
  ({home,exam:examList,stats}[TAB]||home)();
}

/* ---------- lock ---------- */
function lockScreen(err){
  shell(`${header()}<div class="card center" style="margin-top:24px"><img class="mascot" src="img/mark.webp" alt="">
  <p class="jp" style="font-size:22px;margin:0 0 4px">ようこそ。</p><p class="muted small" style="margin:0 0 16px">Nhập mã để mở bộ đề. Mỗi máy chỉ cần nhập một lần.</p>
  <input class="field" id="code" placeholder="Mã của anh" autocomplete="off" autocapitalize="off" spellcheck="false">
  ${err?`<p class="small" style="color:var(--ng)">${esc(err)}</p>`:''}
  <button class="btn bee" id="open" style="width:100%;margin-top:14px">Mở</button></div>`,{tabs:false});
  const go=async()=>{const c=$('#code').value;if(!c)return;$('#open').disabled=true;$('#open').textContent='Đang mở…';
    try{DATA=await loadContent(c);ls.set('shiratama-code',c);indexData();render()}catch(e){lockScreen('Mã không đúng, hoặc chưa tải được đề.')}};
  $('#open').onclick=go;$('#code').onkeydown=e=>{if(e.key==='Enter')go()};
}

/* ---------- học thẻ (màn chính) ---------- */
function home(){
  const h=new Date().getHours();const hi=h<11?'おはよう':h<18?'こんにちは':'こんばんは';
  const due=dueIds().length;
  shell(`${header()}
  <div class="card hello"><img class="mascot" src="img/mark.webp" alt=""><div class="grow"><div class="jp" style="font-size:20px;font-weight:700">${hi}、ニャンさん</div>
   <div class="tiny">JLPT N3 · còn <b style="color:var(--ink)">${daysLeft()} ngày</b>${due?` · <a href="#" id="hWrong" style="color:var(--ng)">${due} câu sai cần làm lại</a>`:''}</div></div></div>
  <div class="card" id="ankiBox"><div class="tiny">Đang đọc thẻ…</div></div>`);
  const w=$('#hWrong');if(w)w.onclick=e=>{e.preventDefault();startReview()};
  ankiBox();
}

/* ---------- đề thi ---------- */
function examList(){
  const ex=DATA.exams[0];
  const hist=(S.exams[ex.id]||[]).slice(-5).reverse();
  const due=dueIds().length;
  shell(`${header()}
  <div class="card"><div class="list-item" id="tWrong" style="cursor:pointer;border:0;padding:0"><div class="ico p jp">復</div><div class="grow"><div style="font-weight:800">Câu sai đến hạn</div><div class="tiny">${due?'Làm lại để nhớ chắc':'Chưa có câu nào đến hạn'}</div></div><span class="count" style="color:${due?'var(--ng)':'var(--ink3)'}">${due}</span></div></div>
  <div class="h">Luyện theo phần</div>
  <div class="secgrid">${Object.keys(SEC).map(k=>{const qs=allBy(k);const t=qs.filter(q=>S.ans[q.id]).length;return `<button class="sec" data-prac="${k}"><div class="jp">${SEC[k]}</div><div class="tiny">${SEC_VI[k]}</div><div class="tiny" style="margin-top:6px">${t}/${qs.length} câu đã làm</div></button>`}).join('')}</div>
  <div class="h">Đề thi thật</div>
  <div class="card"><div class="jp" style="font-size:19px;font-weight:700">${esc(ex.title)}</div><div class="tiny" style="margin-top:2px">${esc(ex.src)}</div></div>
  ${ex.parts.map((p,i)=>{const qs=partQs(ex,p);return `<div class="card"><div class="jp" style="font-size:17px;font-weight:700">${esc(p.name)}</div><div class="tiny">${qs.length} câu · ${p.min} phút</div>
   <div class="row" style="margin-top:12px"><button class="btn bee" data-ex="${i}">Thi thật</button><button class="btn line" data-exp="${i}">Luyện từng câu</button></div></div>`}).join('')}
  ${hist.length?`<div class="h">Lần làm gần đây</div><div class="card">${hist.map(h=>`<div class="list-item"><div class="grow"><div class="jp">${esc(h.name)}</div><div class="tiny">${new Date(h.at).toLocaleString('vi-VN')}</div></div><b>${h.c}/${h.n}</b></div>`).join('')}</div>`:''}
  <p class="tiny center">Đáp án theo bản chính thức của JLPT. Âm thanh phát trực tiếp từ jlpt.jp.</p>`);
  $('#tWrong').onclick=()=>{if(due)startReview();else toast('Chưa có câu nào đến hạn')};
  $$('[data-prac]').forEach(b=>b.onclick=()=>startPractice(b.dataset.prac));
  $$('[data-ex]').forEach(b=>b.onclick=()=>startExam(ex,ex.parts[+b.dataset.ex],true));
  $$('[data-exp]').forEach(b=>b.onclick=()=>startExam(ex,ex.parts[+b.dataset.exp],false));
}

/* ---------- phiên làm bài ---------- */
function startExam(ex,part,timed){SS={kind:timed?'exam':'practice',title:part.name,ex,qs:partQs(ex,part),i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now(),deadline:timed?Date.now()+part.min*60000:0,total:part.min*60,part};render()}
function startPractice(sec,n=10){
  const score=q=>{const lo=lastOk(q.id);return lo===null?0:lo===0?1:2};
  const pick=shuffle(allBy(sec)).sort((a,b)=>score(a)-score(b)).slice(0,n);
  pick.sort((a,b)=>(a.p||'').localeCompare(b.p||'')||a.no-b.no);
  SS={kind:'practice',title:SEC_VI[sec],qs:pick,i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now()};render();
}
function startReview(){const ids=shuffle(dueIds());if(!ids.length){toast('Chưa có câu nào đến hạn');return}
  SS={kind:'review',title:'Ôn câu sai',qs:ids.map(id=>QI[id].q),i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now()};render()}
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
  const stem=hideStem?`<div class="stem muted" style="font-size:15px">Nghe để biết câu hỏi</div>`:`<div class="stem">${rich(q.q)}</div>`;
  const opts=q.o.map((o,k)=>{
    let cls='opt';
    if(shown){if(k===q.a)cls+=' right';else if(k===pick)cls+=' wrong';else cls+=' dim'}
    else if(k===pick)cls+=' sel';
    const label=q.hideOpts&&!shown?'<span class="tiny">(nghe lựa chọn trong audio)</span>':esc(o);
    let ex2='';
    if(shown){const why=k===q.a?q.why:(q.w&&q.w[k]);if(why)ex2=`<div class="ex">${k===q.a?'<b>Đúng.</b> ':''}${esc(why)}</div>`}
    return `<button class="${cls}" data-k="${k}" ${shown?'disabled':''}><div class="l"><span class="n">${k+1}</span><span>${label}</span></div><div class="hint">${exam?'Chạm lần nữa để chọn':'Chạm lần nữa để chốt'}</div>${ex2}</button>`}).join('');
  let after='';
  if(shown){
    const ok=pick===q.a;
    after=`${q.script?`<details ${ok?'':'open'}><summary>Lời thoại</summary><div class="script">${esc(q.script)}</div></details>`:''}
     <div class="tiny" style="margin-top:10px">${esc(q.type)}${q.tag?' · '+esc(q.tag):''}</div>`;
  }
  const last=SS.i===SS.qs.length-1;
  let nav='';
  if(exam)nav=`<div class="navq"><button class="btn line" id="prev" ${SS.i?'':'disabled'}>Câu trước</button>${last?`<button class="btn bee" id="submit">Nộp bài</button>`:`<button class="btn" id="next">Câu sau</button>`}</div>
    <details><summary>Phiếu trả lời</summary><div class="sheet">${SS.qs.map((x,k)=>`<button data-go="${k}" class="${SS.picks[x.id]!=null?'done':''} ${k===SS.i?'cur':''}">${k+1}</button>`).join('')}</div></details>`;
  else if(shown)nav=`<div class="navq"><button class="btn bee" id="next">${last?'Xem kết quả':'Câu tiếp'}</button></div>${pick===q.a&&SS.kind!=='view'?`<button class="guess" id="guess">Câu này mình đoán mò, cho vào ôn lại</button>`:''}`;
  const verdict=shown?`<div class="verdict ${pick===q.a?'ok':'ng'}">${pick===q.a?I.ok+' Chính xác':pick==null?'Chưa chọn · đáp án '+(q.a+1):'Chưa đúng · đáp án '+(q.a+1)}</div>`:'';
  const qpane=`${q.audio?audioHTML(q):''}<div class="qmeta"><span class="pill jp">問題${q.m}</span><span class="tiny">${esc(q.type)}</span></div>${stem}${verdict}<div class="opts">${opts}</div>${after}${nav}`;
  const bar=exam?`<div class="tbar" id="tbar"><i id="tfill"></i></div>`:'';
  full(`<div class="sbar"><button class="iconbtn" id="quit" aria-label="Thoát">${SS.kind==='view'?I.back:I.x}</button><div class="ttl">${esc(SS.title)}</div><span class="pill" id="qn">${SS.i+1}/${SS.qs.length}</span></div>
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
  else $('#quit').onclick=()=>{if(exam&&!confirm('Thoát bài thi? Các câu đã chọn sẽ không được chấm.'))return;SS=null;clearInterval(TIMER);render()};
  // chạm một lần để chọn, chạm lại để chốt
  $$('.opt').forEach(b=>b.onclick=()=>{if(shown)return;const k=+b.dataset.k;
    if(SS.picks[q.id]===k&&b.classList.contains('sel')){
      if(exam){if(!last){SS.i++;SS.qt=Date.now();renderSession()}else{b.classList.remove('sel');toast('Đã chọn. Bấm Nộp bài khi xong.')}}
      else check(q);
      return}
    SS.picks[q.id]=k;$$('.opt').forEach(o=>o.classList.toggle('sel',+o.dataset.k===k));
    const d=document.querySelector(`[data-go="${SS.i}"]`);if(d)d.classList.add('done')});
  const nx=$('#next');if(nx)nx.onclick=()=>{if(!exam&&last){if(SS.kind==='view')return;return finish()}SS.i++;SS.qt=Date.now();renderSession()};
  const pv=$('#prev');if(pv)pv.onclick=()=>{SS.i--;renderSession()};
  const gs=$('#guess');if(gs)gs.onclick=()=>{rate(q.id,1);const a=S.ans[q.id];if(a)a[a.length-1].g=1;save();toast('Đã cho vào ôn lại');gs.remove()};
  const sb=$('#submit');if(sb)sb.onclick=()=>{const left=SS.qs.filter(x=>SS.picks[x.id]==null).length;if(left&&!confirm(`Còn ${left} câu chưa chọn. Nộp bài?`))return;finish()};
  $$('[data-go]').forEach(b=>b.onclick=()=>{SS.i=+b.dataset.go;renderSession()});
  if(exam){let showNum=false;const tb=$('#tbar');
    const tick=()=>{const left=(SS.deadline-Date.now())/1000;const f=$('#tfill');if(f)f.style.width=Math.max(0,left/SS.total*100)+'%';if(tb)tb.classList.toggle('warn',left<300);
      const qn=$('#qn');if(qn)qn.textContent=showNum?fmtTime(left):`${SS.i+1}/${SS.qs.length}`;
      if(left<=0){clearInterval(TIMER);toast('Hết giờ');finish()}};
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
  const byM={};s.qs.forEach(q=>{const k='問題'+q.m+' '+q.type;const o=byM[k]=byM[k]||{c:0,n:0};o.n++;if(s.picks[q.id]===q.a)o.c++});
  shell(`<div class="top"><button class="iconbtn" id="back" aria-label="Về">${I.back}</button><div class="tiny">${esc(s.title)}</div><span style="width:40px"></span></div>
   <div class="card center"><img class="mascot s" src="img/mark.webp" alt=""><div class="big" style="font-size:46px">${c}<span class="muted" style="font-size:22px"> / ${n}</span></div><div class="muted small">${Math.round(c/n*100)}% · ${fmtTime((Date.now()-s.t0)/1000)} phút</div></div>
   <div class="h">Theo dạng câu</div><div class="card">${Object.entries(byM).map(([k,o])=>`<div class="list-item"><div class="grow jp" style="font-size:15px">${esc(k)}</div><div class="meter ${o.c/o.n<.6?'low':''}" style="max-width:110px"><i style="width:${o.c/o.n*100}%"></i></div><b style="min-width:44px;text-align:right">${o.c}/${o.n}</b></div>`).join('')}</div>
   <div class="h">Xem lại từng câu</div><div class="card">${s.qs.map((q,k)=>{const ok=s.picks[q.id]===q.a;return `<div class="list-item" data-rv="${k}" style="cursor:pointer"><span class="pill" style="color:${ok?'var(--ok)':'var(--ng)'}">${ok?'○':'×'}</span><div class="grow jp" style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(plain(q.q))}</div><span class="tiny">${s.picks[q.id]!=null?s.picks[q.id]+1:'–'} → ${q.a+1}</span></div>`}).join('')}</div>
   <p class="tiny center">Câu sai đã được cho vào sổ ôn.</p>`,{tabs:false});
  $('#back').onclick=()=>{TAB='home';render()};
  $$('[data-rv]').forEach(b=>b.onclick=()=>{SS=Object.assign({},s,{kind:'view',i:+b.dataset.rv,back:s});renderSession()});
}

/* ---------- ôn tập ---------- */
function reviewHome(){
  const ids=Object.keys(S.cards).filter(id=>QI[id]);const due=dueIds();
  const soon=ids.map(id=>({id,due:new Date(S.cards[id].due)})).sort((a,b)=>a.due-b.due);
  shell(`${header()}
  <div class="h" style="margin-top:4px">Thẻ</div><div class="card" id="ankiBox"><div class="tiny">Đang đọc…</div></div>
  <div class="h">Sổ câu sai</div>
  <div class="card"><div class="row"><div class="grow"><div class="big">${due.length}<span class="muted" style="font-size:15px"> câu đến hạn · ${ids.length} trong sổ</span></div></div></div>
  <button class="btn bee" id="go" style="margin-top:12px;width:100%" ${due.length?'':'disabled'}>Ôn ${due.length} câu</button>
  ${soon.length?soon.slice(0,20).map(x=>{const q=QI[x.id].q;const d=Math.round((x.due-Date.now())/864e5);return `<div class="list-item"><span class="pill jp">${SEC[q.sec]}</span><div class="grow jp" style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(plain(q.q))}</div><span class="tiny">${d<=0?'hôm nay':d+' ngày'}</span></div>`}).join(''):`<p class="tiny" style="margin:10px 0 0">Câu làm sai hoặc đoán mò sẽ vào đây.</p>`}</div>`);
  $('#go').onclick=()=>startReview();
  ankiBox();
}

/* ---------- thẻ Anki ---------- */
async function ankiState(){if(!window.ANKI)return {decks:[],cards:[]};const [decks,cards]=await Promise.all([ANKI.all('decks'),ANKI.all('cards')]);return {decks,cards}}
function ankiQueue(cards,deck){
  const now=Date.now();
  const mine=cards.filter(c=>!c.susp&&(!deck||c.deck===deck));
  const due=mine.filter(c=>c.card.state!==0&&new Date(c.card.due).getTime()<=now).sort((a,b)=>new Date(a.card.due)-new Date(b.card.due));
  const fresh=mine.filter(c=>c.card.state===0); // không giới hạn thẻ mới
  return {due,fresh};
}
async function ankiBox(){
  const box=$('#ankiBox');if(!box)return;
  let st;try{st=await ankiState()}catch(e){box.innerHTML='<div class="muted small">Trình duyệt chặn bộ nhớ, chưa dùng được phần thẻ.</div>';return}
  if(!document.body.contains(box))return;
  const rows=st.decks.map(d=>{const q=ankiQueue(st.cards,d.id);const n=st.cards.filter(c=>c.deck===d.id).length;return {d,q,n}}).filter(r=>r.n).sort((a,b)=>a.d.name.localeCompare(b.d.name));
  const tot=ankiQueue(st.cards);
  box.innerHTML=`${rows.length?`<div class="big">${tot.due.length}<span class="muted" style="font-size:15px"> thẻ đến hạn · ${tot.fresh.length} thẻ mới</span></div>
   <button class="btn bee" id="ankiAll" style="width:100%;margin:12px 0 4px;font-size:17px;padding:16px" ${tot.due.length+tot.fresh.length?'':'disabled'}>${tot.due.length?`Học ${tot.due.length} thẻ đến hạn`:tot.fresh.length?'Học thẻ mới':'Xong hết rồi'}</button>
   ${rows.map(r=>`<div class="list-item"><div class="grow"><div class="jp" style="font-size:15px;font-weight:700">${esc(r.d.name)}</div><div class="tiny">${r.n} thẻ · <b style="color:var(--ink)">${r.q.due.length}</b> đến hạn · ${r.q.fresh.length} mới</div></div>
     <button class="btn line" data-deck="${esc(r.d.id)}" ${r.q.due.length?'':'disabled'}>Ôn</button>${r.q.fresh.length?`<button class="btn soft" data-new="${esc(r.d.id)}">Học mới</button>`:''}</div>`).join('')}`
   :`<p class="muted small" style="margin:0 0 4px">Nhập file .apkg xuất từ Anki (tích "Include scheduling information"). Lịch ôn của từng thẻ được giữ nguyên.</p>`}
   <div class="row" style="margin-top:12px"><button class="btn line" id="ankiImp">Nhập file .apkg</button>${rows.length?`<span class="grow"></span><button class="btn line" id="ankiDel" style="padding:12px">Xóa deck…</button>`:''}</div>
   <div class="tiny" id="impMsg" style="margin-top:8px"></div>`;
  const a=$('#ankiAll');if(a)a.onclick=()=>startAnki(null,st,tot.due.length?'due':'new');
  $$('[data-deck]').forEach(b=>b.onclick=()=>startAnki(b.dataset.deck,st,'due'));
  $$('[data-new]').forEach(b=>b.onclick=()=>startAnki(b.dataset.new,st,'new'));
  const dl=$('#ankiDel');if(dl)dl.onclick=async()=>{const nm=prompt('Gõ đúng tên deck muốn xóa khỏi app:\n'+rows.map(r=>r.d.name).join('\n'));const r=rows.find(x=>x.d.name===nm);if(!r)return;await ANKI.delDeck(r.d.id);ankiBox()};
  $('#ankiImp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.apkg,.colpkg';i.onchange=async()=>{const msg=$('#impMsg');
    try{const r=await ANKI.importApkg(i.files[0],t=>msg.textContent=t);msg.textContent=`Đã nhập ${r.cards} thẻ từ ${r.decks} deck, giữ nguyên lịch ôn.${r.skipped?` Bỏ qua ${r.skipped} thẻ dư (dsdshdids).`:''}${r.kept?` ${r.kept} thẻ giữ lịch đã ôn trong app.`:''}`;setTimeout(ankiBox,2500)}
    catch(e){msg.textContent='Không nhập được: '+e.message}};i.click()};
}
function startAnki(deck,st,mode){
  const q=ankiQueue(st.cards,deck);
  let list;
  if(mode==='new')list=q.fresh.slice();
  else if(mode==='due')list=q.due.slice();
  else{list=[];const d=q.due.slice(),f=q.fresh.slice();while(d.length||f.length){for(let k=0;k<4&&d.length;k++)list.push(d.shift());if(f.length)list.push(f.shift())}}
  if(!list.length){toast('Không còn thẻ nào');return}
  AK={list,i:0,show:false,a:0,g:0,hist:[]};render();
}
function backHTML(it){
  const parts=String(it.back).split(/<hr id=["']?answer["']?\s*\/?>/i);
  if(parts.length<2)return it.back;
  const ans=parts.slice(1).join('').replace(/^(\s*<br\s*\/?>)+/i,'').replace(/(<br\s*\/?>\s*){3,}/gi,'<br><br>');
  return `<div class="q">${parts[0]}</div><hr><div class="ans">${ans}</div>`;
}
function reviveA(c){const o=Object.assign({},c);o.due=new Date(c.due);if(c.last_review)o.last_review=new Date(c.last_review);return o}
function renderAnki(){
  const it=AK.list[AK.i];
  if(!it){shell(`<div class="card center" style="margin-top:40px"><img class="mascot" src="img/mark.webp" alt=""><div class="jp" style="font-size:22px">おつかれさま。</div><p class="muted">Xong ${AK.a+AK.g} lượt: ${AK.g} nhớ, ${AK.a} quên.</p><button class="btn bee" id="akb">Về</button></div>`,{tabs:false});$('#akb').onclick=()=>{AK=null;TAB='home';render()};return}
  const left=AK.list.length-AK.i;
  full(`<div class="sbar"><button class="iconbtn" id="akq" aria-label="Dừng">${I.x}</button><div class="ttl">Còn ${left} thẻ${it.card.state===0?' · thẻ mới':''}</div><button class="iconbtn" id="akundo" aria-label="Hoàn tác" ${AK.hist.length?'':'disabled style="opacity:.35"'}>${I.undo}</button></div>
   <div class="dstat"><span class="a">Quên ${AK.a}</span><span class="g">Nhớ ${AK.g}</span></div>
   <div class="deckwrap"><div class="stage" id="stage"><div class="fc" id="fc"><div class="face front">${it.front}</div><div class="face back">${backHTML(it)}</div></div>
     <div class="zone l">← Quên</div><div class="zone r">Nhớ →</div></div>
     <div class="tiny center" style="margin-top:10px" id="akhint">Chạm thẻ để lật</div></div>`);
  ANKI.hydrate($('#fc'));
  $('#akq').onclick=()=>{AK=null;TAB='home';render()};
  $('#akundo').onclick=undoAnki;
  const fc=$('#fc'),stage=$('#stage');
  let busy=false;
  const flip=()=>{AK.show=true;fc.classList.add('flip');stage.classList.add('shown');$('#akhint').textContent='Chạm nửa phải hoặc vuốt phải = Nhớ · nửa trái hoặc vuốt trái = Quên'};
  const grade=async(g)=>{if(busy)return;busy=true;fc.style.transform='';fc.classList.add(g===3?'fly-r':'fly-l');
    const prev=JSON.parse(JSON.stringify(it));const pos=AK.i;
    if(hasF){it.card=F.repeat(reviveA(it.card),new Date())[g].card}
    it.appAt=Date.now();
    try{await ANKI.put('cards',it)}catch(e){toast('Không lưu được thẻ')}
    if(g===1)AK.a++;else AK.g++;
    AK.hist.push({pos,prev,g,len:AK.list.length});
    if(new Date(it.card.due)-Date.now()<20*60000)AK.list.push(it);
    setTimeout(()=>{AK.i++;AK.show=false;renderAnki()},230)};
  // chạm và vuốt
  let sx=0,sy=0,dx=0,drag=false,moved=false;
  fc.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;dx=0;drag=true;moved=false;fc.style.transition='none'});
  fc.addEventListener('pointermove',e=>{if(!drag||!AK.show)return;dx=e.clientX-sx;if(Math.abs(dx)>8)moved=true;
    if(moved){fc.style.transform=`translateX(${dx}px) rotate(${dx/22}deg) rotateY(180deg)`;fc.classList.toggle('tint-r',dx>40);fc.classList.toggle('tint-l',dx<-40)}});
  const end=e=>{if(!drag)return;drag=false;fc.style.transition='';fc.classList.remove('tint-r','tint-l');
    if(!AK.show){if(Math.abs(e.clientX-sx)<12&&Math.abs(e.clientY-sy)<12)flip();return}
    if(moved){if(dx>70)return grade(3);if(dx<-70)return grade(1);fc.style.transform='';return}
    const r=stage.getBoundingClientRect();grade(e.clientX>r.left+r.width/2?3:1)};
  fc.addEventListener('pointerup',end);fc.addEventListener('pointercancel',()=>{drag=false;fc.style.transform='';fc.style.transition=''});
  AK.key=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!AK.show)flip()}else if(AK.show&&(e.key==='ArrowRight'||e.key==='2'))grade(3);else if(AK.show&&(e.key==='ArrowLeft'||e.key==='1'))grade(1);else if(e.key==='z'||e.key==='Backspace')undoAnki()};
}
async function undoAnki(){
  const h=AK.hist.pop();if(!h)return;
  AK.list.length=h.len;AK.list[h.pos]=h.prev;AK.i=h.pos;AK.show=false;
  if(h.g===1)AK.a--;else AK.g--;
  try{await ANKI.put('cards',h.prev)}catch(e){}
  renderAnki();
}
document.addEventListener('keydown',e=>{if(AK&&AK.key)AK.key(e)});

/* ---------- điểm yếu ---------- */
function stats(){
  const rows={};const tags={};
  Object.entries(S.ans).forEach(([id,a])=>{const x=QI[id];if(!x)return;const q=x.q;
    const k=SEC[q.sec]+' · 問題'+q.m+' '+q.type;const r=rows[k]=rows[k]||{c:0,n:0,o:q.no};
    a.forEach(e=>{r.n++;if(e.ok&&!e.g)r.c++});
    const l=a[a.length-1];if(!l.ok||l.g){tags[q.tag]=tags[q.tag]||[];tags[q.tag].push(q)}});
  const list=Object.entries(rows).sort((a,b)=>a[1].o-b[1].o);
  const weak=Object.entries(rows).filter(([k,r])=>r.n>=2).sort((a,b)=>a[1].c/a[1].n-b[1].c/b[1].n).slice(0,3);
  shell(`${header()}
  ${weak.length?`<div class="card"><div class="tiny">Yếu nhất hiện tại</div>${weak.map(([k,r])=>`<div class="row" style="margin-top:8px"><div class="grow jp" style="font-size:16px">${esc(k)}</div><b style="color:var(--ng)">${Math.round(r.c/r.n*100)}%</b></div>`).join('')}</div>`:''}
  <div class="h">Tỉ lệ đúng theo dạng câu</div>
  <div class="card">${list.length?list.map(([k,r])=>`<div class="list-item"><div class="grow jp" style="font-size:15px">${esc(k)}</div><div class="meter ${r.c/r.n<.6?'low':''}" style="max-width:100px"><i style="width:${r.c/r.n*100}%"></i></div><b style="min-width:48px;text-align:right">${r.c}/${r.n}</b></div>`).join(''):'<div class="empty"><img class="mascot s" src="img/mark.webp" alt="">Làm vài câu là ở đây có số liệu.</div>'}</div>
  <div class="h">Điểm ngữ pháp, từ vựng đang sai</div>
  <div class="card">${Object.keys(tags).length?`<div class="row" style="flex-wrap:wrap;gap:8px">${Object.keys(tags).map(t=>`<span class="chip jp">${esc(t)}</span>`).join('')}</div>`:'<div class="tiny">Chưa có.</div>'}</div>
  <div class="h">Dữ liệu</div>
  <div class="card"><div class="row"><button class="btn line" id="exp">Sao lưu</button><button class="btn line" id="imp">Khôi phục</button></div><p class="tiny" style="margin:10px 0 0">Tiến độ lưu trong máy này. Sao lưu ra file để chuyển máy.</p></div>`);
  $('#exp').onclick=()=>{const b=new Blob([JSON.stringify(S)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='shiratama-saoluu-'+new Date().toISOString().slice(0,10)+'.json';a.click()};
  $('#imp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=async()=>{try{const d=JSON.parse(await i.files[0].text());if(!d.ans)throw 0;S=Object.assign(structuredClone(DEF),d);save();toast('Đã khôi phục');render()}catch(e){toast('File không hợp lệ')}};i.click()};
}

/* ---------- boot ---------- */
(async()=>{
  const c=ls.get('shiratama-code',null);
  if(c){try{DATA=await loadContent(c);indexData()}catch(e){DATA=null}}
  render();
})();
})();
