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
const examTitle=ex=>ex.vi?L(ex.vi,ex.en||ex.vi):L('Đề mẫu chính thức JLPT N3 (2018)','Official JLPT N3 sample test (2018)');
const exShort=ex=>ex.short||L('Đề mẫu 2018','Sample 2018');
const srcLabel=(q,ex)=>L('Đề ','Test ')+exShort(ex)+' · '+L('câu ','Q')+q.no;
const examsSorted=()=>DATA.exams.slice().sort((a,b)=>(b.date||'0').localeCompare(a.date||'0'));
const SIZES=[14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,30,32,34,36,40,44,48],SIZES_OLD=[18,20,22,25,28,32,36];

/* ---------- state ---------- */
const KEY='shiratama-v1';
const DEF={v:1,ans:{},cards:{},exams:{},theme:'auto',mode:'auto',size:2,lang:'vi'};
let S=Object.assign(structuredClone(DEF),ls.get(KEY,{}));
if(S.size==null||!S.size2){S.size=3;S.size2=1} if(!S.size3){const px=SIZES_OLD[S.size]||25;S.size=Math.max(0,SIZES.indexOf(px));S.size3=1} if(!S.mode)S.mode='auto'; if(!S.lang)S.lang='vi';
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
// bộ nhớ đệm trên máy cho đề đã giải mã, để lần mở sau không phải tải và giải mã lại (không chứa tiến độ học)
const KV=(()=>{let db;const open=()=>db||(db=new Promise((res,rej)=>{const r=indexedDB.open('shiratama-cache',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
  const run=(mode,f)=>open().then(d=>new Promise((res,rej)=>{const q=f(d.transaction('kv',mode).objectStore('kv'));q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}));
  return {get:k=>run('readonly',s=>s.get(k)).catch(()=>null),set:(k,v)=>run('readwrite',s=>s.put(v,k)).catch(()=>null)}})();
async function codeTag(code){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('shiratama-ck|'+code.trim()));return [...new Uint8Array(h)].slice(0,8).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function loadContent(code){
  const [idx,ck]=await Promise.all([fetch('data/index.json',{cache:'no-cache'}).then(r=>r.json()),codeTag(code)]);
  const exams=await Promise.all(idx.files.map(async f=>{
    const c=await KV.get('ex:'+f),tag=idx.tag&&idx.tag[f];
    if(c&&c.ck===ck&&tag&&c.iv===tag)return c.ex;
    const enc=await fetch('data/'+f,{cache:'no-cache'}).then(r=>r.json());
    if(c&&c.ck===ck&&c.iv===enc.iv)return c.ex;
    const key=await deriveKey(code,b64(enc.salt));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(enc.iv)},key,b64(enc.data));
    const ex=JSON.parse(new TextDecoder().decode(plain));KV.set('ex:'+f,{ck,iv:enc.iv,ex});return ex}));
  return {exams};
}
function indexData(){QI={};DATA.exams.forEach(ex=>ex.qs.forEach(q=>{QI[q.id]={q,ex}}))}

/* ---------- helpers ---------- */
function record(q,ok,mode,ms){(S.ans[q.id]=S.ans[q.id]||[]).push({t:Date.now(),ok:ok?1:0,m:mode,ms:ms|0})}
function lastOk(id){const a=S.ans[id];return a&&a.length?a[a.length-1].ok:null}
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
function fmtTime(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function examDay(){const v=S.examDay===undefined?'2026-12-06':S.examDay;return v?new Date(v+'T09:00:00'):null}
function examName(){return S.examName||'JLPT N3'}
function daysLeft(){const d=examDay();return d?Math.max(0,Math.ceil((d-Date.now())/864e5)):null}
function examDayDialog(done){const v=document.createElement('div');v.className='veil';const cur=S.examDay===undefined?'2026-12-06':S.examDay;
  v.innerHTML=`<div class="panel"><div class="row" style="margin-bottom:10px"><div class="grow" style="font-weight:800;font-size:18px">${L('Ngày thi của anh','Your exam date')}</div><button class="iconbtn" id="edx">${I.x}</button></div>
   <label class="lab">${L('Tên kỳ thi','Exam name')}<input class="field" id="edn" value="${esc(examName())}"></label>
   <label class="lab">${L('Ngày thi','Exam date')}<input class="field" id="edd" type="date" value="${esc(cur)}"></label>
   <div class="ohint">${L('Để trống ngày thì app không đếm ngược nữa.','Leave the date empty to hide the countdown.')}</div>
   <button class="btn bee" id="eds" style="width:100%;margin-top:14px">${L('Lưu','Save')}</button></div>`;
  document.body.appendChild(v);const q=x=>v.querySelector(x);const close=()=>v.remove();v.onclick=e=>{if(e.target===v)close()};q('#edx').onclick=close;
  q('#eds').onclick=()=>{S.examDay=q('#edd').value||'';S.examName=q('#edn').value.trim()||'JLPT N3';save();close();done&&done()}}
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
  note:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  plus:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  folder:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  upload:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
  shuffle:'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  ok:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>'
};

/* ---------- Shiratama (chó ong của Na) ---------- */
const SPRNAME={mini:'logo',perch:'home',buddy:'study',fb:'intro'};
function dog(cls,id,name){name=name||SPRNAME[(cls||'').split(' ')[0]]||'intro';return `<div class="dog spr sp-${name} ${cls||''}" ${id?`id="${id}"`:''} aria-hidden="true"><i class="sf"></i></div>`}
// chạy một đoạn khung hình (ví dụ chó nói, chó vui), xong thì về dáng thường
function sprAct(el,cls,ms){if(!el)return;el.classList.remove('talk','yay','sad');void el.offsetWidth;el.classList.add(cls);clearTimeout(el._s);el._s=setTimeout(()=>el.classList.remove(cls),ms||1800)}
function dogSay(el,txt,ms){if(!el)return;let b=el.querySelector('.bubble');if(!b){b=document.createElement('div');b.className='bubble';el.appendChild(b)}b.textContent=txt;b.classList.remove('show');void b.offsetWidth;b.classList.add('show');clearTimeout(b._t);b._t=setTimeout(()=>b.classList.remove('show'),ms||3200)}
function dogDo(el,act){if(!el)return;el.classList.remove('hop','tilt','buzz');void el.offsetWidth;el.classList.add(act);clearTimeout(el._d);el._d=setTimeout(()=>el.classList.remove(act),800)}
const DOG_LINES=()=>[L('Gâu! Học tiếp nha anh.','Woof! Let’s keep going.'),L('Từ nào khó cứ để em canh cho.','I’ll keep an eye on the hard ones.'),L('Uống miếng nước rồi học tiếp nè.','Sip some water, then back to it.'),L('Em bay vòng vòng chờ anh đó.','I’m buzzing around waiting for you.'),L('Một thẻ một thẻ là xong hết thôi.','One card at a time.'),L('Hôm nay trời đẹp ghê.','Lovely sky today.')];
/* ---------- audio ---------- */
let AU=null,AUQ=null,AUTick=null;
function stopAudio(){if(AU)AU.pause();clearInterval(AUTick);AUQ=null;const b=$('#aubtn');if(b)b.innerHTML=I.play}
const AUENC={};
async function encAudio(name){
  if(AUENC[name])return AUENC[name];
  return AUENC[name]=(async()=>{const buf=new Uint8Array(await fetch('data/audio/'+name+'.bin').then(r=>{if(!r.ok)throw new Error('audio '+r.status);return r.arrayBuffer()}));
    const key=await deriveKey(ls.get('shiratama-code',''),buf.slice(0,16));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(16,28)},key,buf.slice(28));
    return URL.createObjectURL(new Blob([plain],{type:'audio/mpeg'}))})().catch(e=>{delete AUENC[name];throw e});
}
async function playSeg(q,restart){
  if(!AU){AU=new Audio();AU.preload='auto'}
  let src=q.audio;
  if(src.startsWith('enc:')){const bt=$('#aubtn');if(bt&&!AUENC[src.slice(4)])bt.classList.add('loading');
    try{src=await encAudio(src.slice(4))}catch(e){console.warn(e);toast(L('Chưa tải được file nghe','Could not load the audio'));if(bt)bt.classList.remove('loading');return}
    if(bt)bt.classList.remove('loading')}
  const [a,b]=q.t;
  const go=()=>{if(restart||AU.currentTime<a||AU.currentTime>=b-0.2)AU.currentTime=a;AU.play().catch(()=>toast(L('Không phát được âm thanh','Could not play audio')))};
  if(AU.dataset.src!==q.audio){AU.src=src;AU.dataset.src=q.audio;AU.addEventListener('loadedmetadata',go,{once:true});AU.load()}else go();
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
/* ---------- bầu trời động: mây trôi, màu theo giờ, nghiêng máy; đêm là ngân hà ---------- */
function cloud(cls,top,w,dur,delay,op){return `<div class="cloud ${cls}" style="top:${top}%;--w:${w}px;--dur:${dur}s;animation-delay:-${delay}s;opacity:${op}"><i></i><i></i><i></i><i></i></div>`}
const STARS=(()=>{let r='';let seed=7;const rnd=()=>(seed=(seed*9301+49297)%233280)/233280;
  for(let k=0;k<150;k++){const x=rnd()*400,y=rnd()*800,big=rnd();const rr=big>.93?1.7:big>.75?1.1:.6;r+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr}" class="tw t${k%4}"/>`}return r})();
const SPARK=[[8,6,1],[84,4,1.2],[76,47,.9],[22,72,.7],[50,20,.6],[92,30,.5],[12,38,.55],[64,64,.6],[36,90,.5],[88,82,.45]];
const SKY=`<div class="sky"><div class="sky-grad"></div>
<div class="paint pday"></div><div class="tint"></div>
<div class="meadow"></div>
<img class="bfly" src="img/butterfly.webp" alt="">
<div class="night"><div class="paint pnight"></div>
<div class="wisp w1"></div><div class="wisp w2"></div><div class="wisp w3"></div>
<svg class="stars" width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">${STARS}</svg>
${SPARK.map(([x,y,k],i)=>`<img class="spark" src="img/star.webp" alt="" style="left:${x}%;top:${y}%;--k:${k};animation-delay:-${(i*0.7).toFixed(1)}s">`).join('')}
<div id="shoot"></div></div></div>`;
function ensureSky(){if(!document.querySelector('.sky')){document.body.insertAdjacentHTML('afterbegin',SKY);SKYFX.start()}}
const SKYFX=(()=>{
  // màu trời theo giờ (ban ngày): bình minh hồng, trưa xanh, chiều vàng cam
  const K=[[5,'#f0a9b4','#fcd9c8'],[7,'#7fbcf0','#d4ebfb'],[11,'#5aa8ec','#cfe8fb'],[15,'#72b4ee','#d9ecfa'],[17,'#f2b07a','#fbdcc0'],[18.5,'#d98aa8','#f6cfc8'],[24,'#d98aa8','#f6cfc8']];
  const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),mix=(a,b,t)=>'#'+hex(a).map((v,i)=>Math.round(v+(hex(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
  function tint(){const d=new Date(),h=d.getHours()+d.getMinutes()/60;let i=0;while(i<K.length-1&&K[i+1][0]<=h)i++;
    const A=K[i],B=K[Math.min(i+1,K.length-1)];const t=B[0]>A[0]?Math.min(1,Math.max(0,(h-A[0])/(B[0]-A[0]))):0;
    const r=document.documentElement.style;const hh=h<5?K[0]:null;r.setProperty('--day1',hh?hh[1]:mix(A[1],B[1],t));r.setProperty('--day2',hh?hh[2]:mix(A[2],B[2],t));
    r.setProperty('--tinto',Math.min(.5,Math.pow(Math.abs(h-12.5)/6.5,1.6)*.5).toFixed(3));r.setProperty('--sunx',(10+80*Math.min(1,Math.max(0,(h-6)/12)))+'%');r.setProperty('--suny',(8+28*Math.abs((h-12)/6))+'%')}
  // nghiêng máy / rê chuột: các lớp mây lệch nhau
  let tx=0,ty=0,cx=0,cy=0,raf=0;
  function loop(){cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;const r=document.documentElement.style;r.setProperty('--px',cx.toFixed(3));r.setProperty('--py',cy.toFixed(3));raf=Math.abs(tx-cx)+Math.abs(ty-cy)>.001?requestAnimationFrame(loop):0}
  const kick=()=>{if(!raf)raf=requestAnimationFrame(loop)};
  function onOri(e){if(e.gamma==null)return;tx=Math.max(-1,Math.min(1,e.gamma/30));ty=Math.max(-1,Math.min(1,((e.beta||45)-45)/30));kick()}
  function tilt(){if(S.tilt===0)return;window.addEventListener('deviceorientation',onOri)}
  function askTilt(){ // iPhone cần anh cho phép một lần
    const D=window.DeviceOrientationEvent;if(D&&typeof D.requestPermission==='function'){return D.requestPermission().then(r=>{if(r==='granted'){S.tilt=1;save();tilt();return true}return false}).catch(()=>false)}
    S.tilt=1;save();tilt();return Promise.resolve(true)}
  // sao băng
  function shoot(){const el=document.getElementById('shoot');if(el&&isNight()&&!document.hidden){const st=document.createElement('i');st.style.left=(20+Math.random()*70)+'%';st.style.top=(Math.random()*35)+'%';el.appendChild(st);setTimeout(()=>st.remove(),1600)}setTimeout(shoot,6000+Math.random()*14000)}
  let started=false;
  return {start(){if(started)return;started=true;tint();setInterval(tint,120000);
      window.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;tx=(e.clientX/innerWidth-.5)*1.4;ty=(e.clientY/innerHeight-.5)*1.4;kick()},{passive:true});
      const D=window.DeviceOrientationEvent;if(D&&typeof D.requestPermission!=='function')tilt();else if(S.tilt===1){const once=()=>{askTilt();document.removeEventListener('pointerup',once)};document.addEventListener('pointerup',once)}
      setTimeout(shoot,4000)},askTilt,needsAsk:()=>{const D=window.DeviceOrientationEvent;return !!(D&&typeof D.requestPermission==='function')}};
})();
function shell(inner,{tabs=true}={}){
  ensureSky();document.body.classList.remove('studying');
  const same=LASTPAGE===TAB+'|'+(AK?1:0);LASTPAGE=TAB+'|'+(AK?1:0);
  $('#app').innerHTML=`<div class="wrap ${same?'':'enter'}">${inner}</div>`+(tabs?`<nav class="tabs">
   ${[['home',I.cards,L('Học thẻ','Study')],['exam',I.test,L('Luyện đề','Practice')],['sys',I.gear,L('Hệ thống','System')]].map(([k,j,v])=>`<button data-tab="${k}" class="${mainTab()===k?'on':''}"><b>${j}</b>${v}</button>`).join('')}</nav>`:'');
  $$('[data-tab]').forEach(b=>b.onclick=()=>{const k=b.dataset.tab;if(k==='exam')EXD=null;TAB=k==='home'?(S.lastStudy||'home'):k==='exam'?(S.lastExam||'exam'):k;if(TIP)TIP.style.display='none';render()});
  $$('[data-sub]').forEach(b=>b.onclick=()=>{TAB=b.dataset.sub;if(STUDY_SUB.includes(TAB))S.lastStudy=TAB;else if(EXAM_SUB.includes(TAB))S.lastExam=TAB;save();BR.pick=null;if(TIP)TIP.style.display='none';render()});
  window.scrollTo(0,0);
}
let LASTPAGE='';
function full(inner){LASTPAGE='';ensureSky();document.body.classList.add('studying');$('#app').innerHTML=`<div class="sess">${inner}</div>`}
function greet(){const h=new Date().getHours();return L(h<11?'Chào buổi sáng':h<18?'Chào buổi chiều':'Chào buổi tối',h<11?'Good morning':h<18?'Good afternoon':'Good evening')+L(', anh Nhân',', Nhân')}
const STUDY_SUB=['home','browse','stats'],EXAM_SUB=['exam','examstats'];
function mainTab(){return STUDY_SUB.includes(TAB)?'home':EXAM_SUB.includes(TAB)?'exam':'sys'}
function subnav(){if(!DATA)return '';
  const m=mainTab();const it=m==='home'?[['home',L('Tổng quan','Overview')],['browse',L('Duyệt thẻ','Browse')],['stats',L('Thống kê','Stats')]]:m==='exam'?[['exam',L('Bộ đề','Tests')],['examstats',L('Thống kê','Stats')]]:null;
  return it?`<div class="subnav">${it.map(([k,l])=>`<button data-sub="${k}" class="${TAB===k?'on':''}">${l}</button>`).join('')}</div>`:''}
function header(){return `<div class="top"><div class="brand">${dog('mini')}<div>${APP}<small>${greet()}</small></div></div>${DATA?SYNC.chip():''}</div>${subnav()}`}

function sys(){
  const draw=()=>{shell(`${header()}<div class="h">${L('Hệ thống','System')}</div><div class="sysgrid">
   <div class="card"><div class="ot">${L('Ngôn ngữ','Language')}</div>
    <div class="seg">${[['vi','Tiếng Việt'],['en','English']].map(([k,l])=>`<button data-l="${k}" class="${S.lang===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="ot">${L('Giao diện','Appearance')}</div>
    <div class="seg" id="smode">${[['auto',L('Theo giờ','By time')],['day',L('Ban ngày','Day')],['night',L('Ban đêm','Night')]].map(([k,l])=>`<button data-m="${k}" class="${S.mode===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="tiny" style="margin-top:6px">${L('Theo giờ: ban đêm từ 18:00 đến 6:00.','By time: starry night from 18:00 to 6:00.')}</div></div>
   <div class="card"><div class="ot">${L('Bầu trời','Sky')}</div>
    <div class="seg">${[[1,L('Mây nghiêng theo máy','Tilt with phone')],[0,L('Mây đứng yên','Still')]].map(([k,l])=>`<button data-tl="${k}" class="${(S.tilt===0?0:1)===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="tiny" style="margin-top:6px">${L('Màu trời ban ngày đổi theo giờ: sáng hồng, trưa xanh, chiều cam. Ban đêm là dải ngân hà.','Daytime sky changes with the hour. Night shows the Milky Way.')}${SKYFX.needsAsk()?L(' iPhone sẽ hỏi quyền dùng cảm biến chuyển động một lần.',' iPhone asks for motion access once.'):''}</div></div>
   <div class="card"><div class="ot">${L('Nhạc nền','Background music')}</div>
    <div class="row"><div class="seg grow">${[[1,L('Bật','On')],[0,L('Tắt','Off')]].map(([k,l])=>`<button data-mu="${k}" class="${(MUSIC.on?1:0)===k?'on':''}">${l}</button>`).join('')}</div></div>
    <div class="row" style="margin-top:12px"><span class="tiny">${L('Âm lượng','Volume')}</span><input type="range" id="smv" class="grow" min="0" max="100" value="${Math.round((S.vol??0.5)*100)}" style="accent-color:var(--bee-deep)"></div>
    <div class="tiny" style="margin-top:8px">${L('Nhạc do app tự soạn, không lặp lại. Ban ngày sáng và nhịp vừa, ban đêm chậm và mơ màng hơn. Bật tắt nhanh bằng nút nốt nhạc khi học.','Generative music that never repeats: brighter by day, slower and dreamier at night. Toggle with the note button while studying.')}</div></div>
   <div class="card"><div class="ot">${L('Hiệu ứng âm thanh','Sound effects')}</div>
    <div class="seg">${[[1,L('Bật','On')],[0,L('Tắt','Off')]].map(([k,l])=>`<button data-sf="${k}" class="${(S.sfx===0?0:1)===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="row" style="margin-top:12px"><span class="tiny">${L('Âm lượng','Volume')}</span><input type="range" id="sfv" class="grow" min="0" max="100" value="${Math.round((S.sfxv??0.6)*100)}" style="accent-color:var(--bee-deep)"></div>
    <div class="row wrapbtn" style="margin-top:10px">${[['ok',L('Nhớ','Remembered')],['ng',L('Quên','Forgot')],['flip',L('Lật thẻ','Flip')],['woof',L('Chó ong','Shiratama')]].map(([k,l])=>`<button class="btn line sm" data-try="${k}">▶ ${l}</button>`).join('')}</div>
    <div class="tiny" style="margin-top:8px">${L('Nếu iPhone đang gạt im lặng thì sẽ không nghe tiếng.','No sound when the iPhone silent switch is on.')}</div></div>
   <div class="card"><div class="ot">${L('Kỳ thi','Exam')}</div>
    <div class="kv"><span>${esc(examName())}</span><b>${examDay()?examDay().toLocaleDateString(L('vi-VN','en-GB')):L('chưa đặt','not set')}</b></div>
    <button class="btn line" id="sexd" style="margin-top:10px">${L('Đổi ngày thi','Change exam date')}</button></div>
   <div class="card"><div class="ot">${L('Cỡ chữ trên thẻ và câu hỏi','Text size on cards and questions')}</div>
    <div class="row"><button class="btn line" id="sm" ${S.size?'':'disabled'}>A−</button><b class="tiny grow center" style="font-size:15px">${SIZES[S.size]}px</b><button class="btn line" id="sp" ${S.size<SIZES.length-1?'':'disabled'}>A+</button></div>
    <div class="jp szprev" style="font-size:${SIZES[S.size]}px">日本語の勉強</div>
    <input type="range" id="srng" min="0" max="${SIZES.length-1}" value="${S.size}" style="width:100%;margin-top:12px;accent-color:var(--bee-deep)">
    <div class="tiny" style="margin-top:8px">${L(`${SIZES.length} nấc, từ ${SIZES[0]}px đến ${SIZES[SIZES.length-1]}px. Khi đang học, bấm nút hai chữ T ở góc trên để đổi nhanh.`,`${SIZES.length} steps. While studying, tap the Tt button at the top to change it.`)}</div></div>
   <div class="card"><div class="ot">${L('Ngày mới bắt đầu lúc','New day starts at')}</div>
    <div class="row"><button class="btn line" id="dhm">−</button><b class="grow center" id="dhv" style="font-size:22px">${dayHour()}:00</b><button class="btn line" id="dhp">+</button></div>
    <div class="tiny" style="margin-top:8px">${L('Đến giờ này app mới tính sang ngày mới: mở thẻ mới và đếm lại số thẻ ôn trong ngày. Hay thức khuya thì để muộn hơn.','At this hour the app rolls over to a new day: new cards open and daily counts reset. Night owls can set it later.')}</div></div>
   ${PAD.settingsHTML()}
   <div class="card"><div class="ot">${L('Dữ liệu','Data')}</div>
    <div class="kv"><span>${L('Bộ thẻ Anki cập nhật','Anki collection updated')}</span><b>${ls.get('shiratama-colv')?new Date(ls.get('shiratama-colv')*1000).toLocaleDateString(L('vi-VN','en-GB')):'—'}</b></div>
    <div class="tiny" style="margin:6px 0 12px">${L('Tiến độ học lưu trên máy này, đồng thời được gửi lên kho chung. Điện thoại và máy tính nhập cùng mã sẽ thấy cùng tiến độ.','Progress is saved here and synced. Devices with the same code share progress.')}</div>
    <div class="ot" style="margin-top:4px">${L('Đồng bộ','Sync')}</div>${SYNC.detail()}
    ${SYNC.on?`<div class="row wrapbtn" style="margin:10px 0 12px"><button class="btn line" id="ssync">${L('Đồng bộ ngay','Sync now')}</button></div>`:'<div style="height:12px"></div>'}
    <button class="btn line" id="slock">${L('Khóa app trên máy này','Lock app on this device')}</button></div>
  </div>`);
    $$('[data-l]').forEach(b=>b.onclick=()=>{S.lang=b.dataset.l;save();applyLook();draw()});
    $$('[data-mu]').forEach(b=>b.onclick=()=>{MUSIC.set(b.dataset.mu==='1');draw()});
    $$('[data-sf]').forEach(b=>b.onclick=()=>{SFX.set(b.dataset.sf==='1');draw()});
    $('#sfv').oninput=e=>{S.sfxv=+e.target.value/100;save()};$('#sfv').onchange=()=>SFX.play('ok');
    $$('[data-try]').forEach(b=>b.onclick=()=>SFX.play(b.dataset.try));
    if($('#ssync'))$('#ssync').onclick=()=>SYNC.run();
    $$('[data-tl]').forEach(b=>b.onclick=async()=>{if(b.dataset.tl==='1'){const ok=await SKYFX.askTilt();if(!ok)toast(L('iPhone chưa cho phép cảm biến chuyển động','Motion access was not allowed'))}else{S.tilt=0;save();document.documentElement.style.setProperty('--px',0);document.documentElement.style.setProperty('--py',0)}draw()});
    $('#smv').oninput=e=>{S.vol=+e.target.value/100;save();MUSIC.vol()};
    $$('[data-m]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.m;save();applyLook();draw()});
    $('#sm').onclick=()=>{S.size=Math.max(0,S.size-1);save();applyLook();draw()};
    $('#sp').onclick=()=>{S.size=Math.min(SIZES.length-1,S.size+1);save();applyLook();draw()};
    $('#sexd').onclick=()=>examDayDialog(draw);PAD.bindSettings(draw);
    const dh=d=>{S.dayHour=(dayHour()+d+24)%24;save();$('#dhv').textContent=S.dayHour+':00'};$('#dhm').onclick=()=>dh(-1);$('#dhp').onclick=()=>dh(1);
    $('#srng').oninput=e=>{S.size=+e.target.value;save();applyLook();const c=e.target.closest('.card');c.querySelector('.jp').style.fontSize=SIZES[S.size]+'px';c.querySelector('b.tiny').textContent=SIZES[S.size]+'px'};
    $('#slock').onclick=()=>{if(!confirm(L('Khóa app? Lần sau phải nhập lại mã. Tiến độ học vẫn giữ nguyên.','Lock the app? You will need the code again. Progress is kept.')))return;localStorage.removeItem('shiratama-code');DATA=null;render()};
  };
  draw();
}

/* ---------- v46+: deck tự lướt, thanh tự lướt, ảnh trong thẻ ---------- */
const GRADE_OF={again:1,hard:3,good:3,easy:3};
const STAR='star';
let FV=null;

// deck nào đang ở chế độ tự lướt (deck con theo deck cha gần nhất có đặt chế độ)
function modeOf(name,decks){const by={};decks.forEach(d=>by[d.name]=d);const p=name.split('::');
  for(let i=p.length;i>0;i--){const d=by[p.slice(0,i).join('::')];if(d&&d.mode)return d.mode}return 'srs'}
function flipIds(decks){const s=new Set();decks.forEach(d=>{if(modeOf(d.name,decks)==='flip')s.add(d.id)});return s}

/* ---- nút cỡ chữ (mọi màn học thẻ) ---- */
function sizeBtnHTML(){return `<div class="szw"><button class="iconbtn szb" id="szb" aria-label="${L('Cỡ chữ','Text size')}" title="${L('Cỡ chữ','Text size')}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h11M8.5 5.5v13M13.5 11.5h7.5M17.25 11.5v7"/></svg></button>
  <div class="szpop" id="szpop"><button data-sz="-1" aria-label="A−">A−</button><b id="szv">${SIZES[S.size]}px</b><button data-sz="1" aria-label="A+">A+</button></div></div>`}
function bindSizeBtn(after){const b=$('#szb'),p=$('#szpop');if(!b)return;
  b.onclick=e=>{e.stopPropagation();p.classList.toggle('open')};p.addEventListener('pointerdown',e=>e.stopPropagation());
  p.onclick=e=>{e.stopPropagation();const k=e.target.closest('[data-sz]');if(!k)return;S.size=Math.max(0,Math.min(SIZES.length-1,S.size+ +k.dataset.sz));save();applyLook();$('#szv').textContent=SIZES[S.size]+'px';if(after)after()};
  document.addEventListener('pointerdown',function f(ev){const q=$('#szpop');if(!q){document.removeEventListener('pointerdown',f);return}if(!ev.target.closest('.szw'))q.classList.remove('open')})}
/* ---- thanh tự lướt (giống Anki) ---- */
function autoBarHTML(on,q,a,act,o={}){
  const st=(k,lab,v)=>`<div class="ab-s"><span>${lab}</span><button data-ab="${k}-" aria-label="−">−</button><b data-abv="${k}">${v}s</b><button data-ab="${k}+" aria-label="+">+</button></div>`;
  return `<div class="autobar" id="abar" ${S.autoBar===0&&!o.always?'hidden':''}>
    <button class="ab-play ${on?'on':''}" data-ab="play">${on?I.pause:I.play}<span>${on?L('Đang lướt','Running'):L('Tự lướt','Auto')}</span></button>
    ${st('q',L('Mặt trước','Front'),q)+st('a',L('Mặt sau','Back'),a)}
    ${o.grade?`<div class="ab-g"><span>${L('Tự bấm','Auto grade')}</span>${[['again',L('Quên','Again')],['good',L('Nhớ','Good')],['remind',L('Tự chấm','Manual')]].map(([k,l])=>`<button data-act="${k}" class="${(act==='hard'||act==='easy'?'good':act)===k?'on':''}">${l}</button>`).join('')}</div>`:''}
  </div>`}
function bindAutoBar(bar,ctl){if(!bar)return;
  bar.addEventListener('pointerdown',e=>e.stopPropagation());
  bar.onclick=e=>{e.stopPropagation();const b=e.target.closest('button');if(!b)return;
    if(b.dataset.act){ctl.set('autoAct',b.dataset.act);bar.querySelectorAll('[data-act]').forEach(x=>x.classList.toggle('on',x===b));return}
    const k=b.dataset.ab;if(!k)return;
    if(k==='play'){ctl.on=!ctl.on;b.classList.toggle('on',ctl.on);b.innerHTML=(ctl.on?I.pause:I.play)+`<span>${ctl.on?L('Đang lướt','Running'):L('Tự lướt','Auto')}</span>`;return}
    const f=k[0],d=k[1]==='+'?1:-1;const field=f==='q'?'autoQ':'autoA';const nv=Math.max(1,Math.min(120,(f==='q'?ctl.q:ctl.a)+d));
    ctl.set(field,nv);const v=bar.querySelector(`[data-abv="${f}"]`);if(v)v.textContent=nv+'s'}}

/* ---- tạo deck mới: chọn cách học ---- */
function newDeckDialog(st){
  const v=document.createElement('div');v.className='veil';
  v.innerHTML=`<div class="panel"><div class="row" style="margin-bottom:10px"><div class="grow" style="font-weight:800;font-size:18px">${L('Tạo deck mới','New deck')}</div><button class="iconbtn" id="nx">${I.x}</button></div>
   <label class="lab">${L('Tên deck','Deck name')}<input class="field" id="nn" placeholder="${L('Ví dụ N3','e.g. N3')}"></label>
   <label class="lab">${L('Nằm trong deck','Inside deck')}${parentSelect('npar',st,'',null)}</label>
   <div class="ot" style="margin-top:14px">${L('Cách học','How to study')}</div>
   <div class="modepick">
    <label class="mp"><input type="radio" name="nm" value="srs" checked><span><b>${L('Học đề xuất','Scheduled')}</b><small>${L('App tính lịch ôn như Anki. Mỗi ngày chấm Nhớ/Quên các thẻ đến hạn.','Spaced repetition like Anki. Grade the cards due each day.')}</small></span></label>
    <label class="mp"><input type="radio" name="nm" value="flip"><span><b>${L('Tự lướt thẻ','Flip through')}</b><small>${L('Muốn học lúc nào thì mở ra lướt, đánh dấu ★ cái chưa thuộc. Không tính lịch, không cộng vào số thẻ hôm nay.','Open and flip whenever you like, star what you don\'t know. No schedule.')}</small></span></label>
   </div>
   <div class="ohint">${L('Đổi lại sau được trong nút ⋯ của deck.','You can change this later in the deck ⋯ menu.')}</div>
   <button class="btn bee" id="nok" style="width:100%;margin-top:14px">${L('Tạo deck','Create')}</button></div>`;
  document.body.appendChild(v);const q=s=>v.querySelector(s);q('#nn').focus();
  const close=()=>v.remove();v.onclick=e=>{if(e.target===v)close()};q('#nx').onclick=close;
  const go=async()=>{const short=q('#nn').value.trim().replace(/::+/g,' ');if(!short)return q('#nn').focus();
    const par=q('#npar').value;const nm=(par?par+'::':'')+short;
    if(st.decks.some(d=>d.name===nm)){toast(L('Đã có deck này','Deck exists'));return}
    const mode=v.querySelector('[name=nm]:checked').value;
    await ANKI.put('decks',{id:'d'+Date.now(),name:nm,at:Date.now(),cfgId:'1',mode,ord:Date.now()/1e6});close();dropState();ankiBox()};
  q('#nok').onclick=go;q('#nn').onkeydown=e=>{if(e.key==='Enter')go()};
}
// chọn deck cha (bỏ chính nó và deck con của nó)
function parentSelect(id,st,cur,self){const tree=deckTree(st);const out=[];
  const walk=(n,dep)=>{if(self&&(n===self||n.startsWith(self+'::')))return;out.push([n,dep]);tree.nodes[n].kids.forEach(k=>walk(k,dep+1))};tree.roots.forEach(r=>walk(r,0));
  return `<select class="field" id="${id}"><option value="">${L('(Không, để ở ngoài cùng)','(None, top level)')}</option>${out.map(([n,d])=>`<option value="${esc(n)}" ${n===cur?'selected':''}>${'  '.repeat(d)}${esc(n.split('::').pop())}</option>`).join('')}</select>`}

/* ---- sắp thứ tự deck ---- */
async function moveDeck(st,name,dir){
  const tree=deckTree(st);const par=name.includes('::')?name.slice(0,name.lastIndexOf('::')):null;
  const sib=(par?tree.nodes[par].kids:tree.roots).slice();const i=sib.indexOf(name),j=i+dir;if(i<0||j<0||j>=sib.length)return;
  [sib[i],sib[j]]=[sib[j],sib[i]];
  const rows=[];sib.forEach((n,k)=>{let d=tree.nodes[n].deck;if(!d){d={id:'d'+Date.now()+k,name:n,at:Date.now(),cfgId:'1'}}d.ord=k+1;rows.push(d)});
  await ANKI.putMany('decks',rows);dropState();ankiBox()}

/* ---- ngữ pháp JLPT: ảnh mã hóa, nạp thành deck thường một lần ---- */
const GRAM=(()=>{let key=null,idx=null,loading=null;
  async function load(){if(idx)return idx;if(loading)return loading;const code=ls.get('shiratama-code');if(!code)throw new Error('no code');
    loading=(async()=>{const e=await fetch('data/gram/index.enc.json?v='+window.APPV).then(r=>{if(!r.ok)throw new Error('http');return r.json()});key=await deriveKey(code,b64(e.salt));
      const p=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv)},key,b64(e.data));idx=JSON.parse(new TextDecoder().decode(p));return idx})();
    try{return await loading}catch(e){loading=null;throw e}}
  async function blob(path){await load();const r=await fetch(`data/gram/${path}.bin?g=1`);if(!r.ok)throw new Error('http');const b=new Uint8Array(await r.arrayBuffer());
    const p=await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12)},key,b.slice(12));return new Blob([p],{type:'image/webp'})}
  // thẻ ngữ pháp dạng chữ (HTML tiếng Việt), cũng mã hóa vì repo công khai
  let html=null;async function htmlAll(){if(html)return html;await load();const r=await fetch('data/gram/html.enc.json?v='+window.APPV);if(!r.ok)return {v:0};const e=await r.json();
    const p=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv)},key,b64(e.data));html=JSON.parse(new TextDecoder().decode(p));return html}
  return {load,blob,htmlAll};
})();
const GLV=['N5','N4','N3','N2','N1'];
// tên mẫu: "一番 いちばん" -> 一番（いちばん）, "ちゃいけない じゃだめ" -> ちゃいけない / じゃだめ; dòng dưới là romaji
function gFront(x){const t=[...new Set(String(x.jp).replace(/\s+[A-Za-z][A-Za-z ]*$/,'').trim().split(/\s+/))];
  const kana=w=>/^[\u3040-\u30ff～〜ー]+$/.test(w),kan=w=>/[\u4e00-\u9fff]/.test(w);
  const jp=t.length===2&&kan(t[0])&&kana(t[1])?`${t[0]}（${t[1]}）`:t.join(' / ');
  return `${esc(jp)}<div class="ro">${esc(String(x.ro).replace(/\s*particle$/,''))}</div>`}
async function seedGram(){
  if(!window.ANKI)return;
  // mỗi bản app chỉ kiểm tra thẻ ngữ pháp một lần, các lần mở sau bỏ qua cho nhanh
  if(ls.get('shiratama-gramseed',0)>=3&&ls.get('shiratama-gramchk','')===window.APPV)return;
  let H={v:0};try{if(ls.get('shiratama-gramseed',0)>=3){H=await GRAM.htmlAll();if((H.v||0)<=ls.get('shiratama-gramhtml',0)){ls.set('shiratama-gramchk',window.APPV);return}}}catch(e){return}
  try{const g=await GRAM.load();if(!H.v)H=await GRAM.htmlAll().catch(()=>({v:0}));const decks=await ANKI.all('decks');const old={};(await ANKI.all('cards')).forEach(c=>{if(/^gN\d-/.test(c.id))old[c.id]=c});const have=new Set(Object.keys(old));const fix=[];
    const byName={};decks.forEach(d=>byName[d.name]=d);const root='Ngữ pháp JLPT';const nd=[];
    if(!byName[root])nd.push({id:'dgram',name:root,at:Date.now(),cfgId:'1',mode:'flip'});
    const cards=[];const t0=Date.UTC(2026,10,23);
    GLV.forEach((lv,li)=>{if(!g[lv])return;let d=byName[root+'::'+lv];if(!d){d={id:'dgram'+lv,name:root+'::'+lv,at:Date.now(),cfgId:'1',ord:li+1};nd.push(d)}
      g[lv].forEach((x,n)=>{const id='g'+lv+'-'+n;const tag=x.s?'s':'r';
        // thẻ một mặt: tên (ẩn khi lướt, dùng để tìm) + ảnh; không có mặt sau
        const hx=H[lv]&&H[lv][n];const front=hx||`<div class="gt">${gFront(x)}</div><img src="gram:${lv}/${n}${tag}">`,back='';
        if(have.has(id)){const c=old[id];if(!c.edited&&c.front!==front){c.front=front;c.fl=[front,back];c.back=front+'<hr id=answer>';fix.push(c)}return}
        cards.push({id,deck:d.id,guid:id,fl:[front,back],front,back:front+'<hr id=answer>',tags:'JLPT_'+lv,appAt:0,created:t0+li*1000+n,card:emptyCard()})})});
    if(nd.length)await ANKI.putMany('decks',nd);if(cards.length)await ANKI.putMany('cards',cards);if(fix.length)await ANKI.putMany('cards',fix);
    ls.set('shiratama-gramseed',3);ls.set('shiratama-gramhtml',H.v||0);ls.set('shiratama-gramchk',window.APPV);if(cards.length||fix.length)dropState()}catch(e){console.warn('gram',e)}
}
// ảnh trong thẻ mà máy chưa có: ảnh ngữ pháp mã hóa, hoặc ảnh anh tự thêm ở máy khác
window.ANKI_FB=async n=>{if(n.startsWith('gram:'))return GRAM.blob(n.slice(5));return SYNC.getMedia(n)};

/* ---- ảnh do anh tự thêm: nén webp, lưu máy, gửi lên kho đồng bộ ---- */
async function imgToCard(file){
  const bmp=await createImageBitmap(file);let max=1080,q=.82,out;
  for(let k=0;k<6;k++){const sc=Math.min(1,max/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);out=await new Promise(r=>c.toBlob(r,'image/webp',q));if(out&&out.size<550000)break;max=Math.round(max*.8);q=Math.max(.6,q-.06)}
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-1',await out.arrayBuffer()))].slice(0,10).map(x=>x.toString(16).padStart(2,'0')).join('');
  const name='u'+h+'.webp';await ANKI.put('media',{name,blob:out});SYNC.putMedia(name);return name}

/* ---- màn lướt: danh sách → lướt, ★ chưa thuộc ---- */
const isStar=c=>(' '+(c.tags||'')+' ').includes(' '+STAR+' ');
async function setStar(c,on){const t=new Set((c.tags||'').split(/\s+/).filter(Boolean));on?t.add(STAR):t.delete(STAR);c.tags=[...t].join(' ');try{await ANKI.put('cards',c)}catch(e){toast(L('Không lưu được','Could not save'))}}
function startFlipDeck(st,set,name){
  const tree=deckTree(st);const secs=[];const walk=n=>{const x=tree.nodes[n];if(x.id&&set.has(x.id))secs.push({id:x.id,name:n===name?x.name.split('::').pop():n.slice(name.length+2)});x.kids.forEach(walk)};walk(name);
  const rank={};secs.forEach((x,k)=>rank[x.id]=k);
  const all=st.cards.filter(c=>!c.susp&&set.has(c.deck)).sort((a,b)=>(rank[a.deck]-rank[b.deck])||createdAt(a)-createdAt(b)||String(a.id).localeCompare(String(b.id)));
  if(!all.length){toast(L('Deck này chưa có thẻ','This deck has no cards'));return}
  S.flipPos=S.flipPos||{};FV={key:'d:'+name,title:name.split('::').pop(),secs,col:new Set(ls.get('shiratama-fcol:'+name,null)||(secs.filter(x=>all.some(c=>c.deck===x.id)).length>1?secs.map(x=>x.id):[])),all,only:!!(S.flipOnly||{})[name],name,shuf:false,view:'list',i:0,show:false,auto:false};
  flipItems();render()}
function flipItems(){const F=FV;let it=F.all;if(F.only)it=it.filter(isStar);if(F.shuf)it=F.shufOrder?F.shufOrder.filter(c=>it.includes(c)):it;F.items=it;
  if(F.i>=it.length)F.i=Math.max(0,it.length-1)}
function flipCfg(){S.flipAuto=Object.assign({q:4,a:4},S.flipAuto||{});return S.flipAuto}
const hasBack=c=>stripHtml(String(c.back).split(/<hr id=["']?answer["']?\s*\/?>/i).slice(1).join('')).trim()!==''||/<img/i.test(String(c.back).split(/<hr id=["']?answer["']?\s*\/?>/i).slice(1).join(''));
function renderFlip(){return FV.view==='list'?renderFlipList():renderFlipCard()}
function flipTop(extra){const F=FV,n=F.all.filter(isStar).length;
  return `<div class="sbar fvbar"><button class="iconbtn" id="fvq" aria-label="${L('Đóng','Close')}">${F.view==='list'?I.x:I.back}</button>
   <div class="ttl">${F.view==='list'?'':`<small>${esc(F.title)}</small><span class="qc">${extra}</span>`}</div>
   <button class="iconbtn starf ${F.only?'on':''}" id="fvonly" aria-label="${L('Chỉ thẻ ★','Starred only')}" title="${L('Chỉ lướt thẻ ★','Starred only')}">★<small>${n}</small></button>
   ${F.view==='list'?'':sizeBtnHTML()}<button class="iconbtn ${F.shuf?'on':''}" id="fvsh" aria-label="${L('Trộn thứ tự','Shuffle')}" title="${L('Trộn thứ tự','Shuffle')}">${I.shuffle}</button></div>`}
function bindFlipTop(){const F=FV;
  $('#fvonly').onclick=()=>{if(!F.only&&!F.all.some(isStar)){toast(L('Chưa có thẻ ★ nào','No starred cards yet'));return}F.only=!F.only;S.flipOnly=S.flipOnly||{};S.flipOnly[F.name]=F.only;save();F.i=0;flipItems();render()};
  $('#fvsh').onclick=()=>{F.shuf=!F.shuf;F.shufOrder=F.shuf?shuffle(F.all):null;F.i=0;flipItems();toast(F.shuf?L('Đã trộn thứ tự','Shuffled'):L('Về thứ tự gốc','Original order'));render()}}
function cardTitle(c){const f=String(c.front);
  const gp=f.match(/<div class="gc-p">([\s\S]*?)<\/div>/);if(gp){const gr=f.match(/<div class="gc-r">([\s\S]*?)<\/div>/),gm=f.match(/<div class="gc-m">([\s\S]*?)<\/div>/);
    return {t:stripHtml(gp[1]).trim(),sub:[gr&&stripHtml(gr[1]).trim(),gm&&stripHtml(gm[1]).trim()].filter(Boolean).join(' · '),im:false}}const ro=(f.match(/<div class="ro">([\s\S]*?)<\/div>/)||[])[1];const g=f.replace(/<div class="ro">[\s\S]*?<\/div>/,'');
  const m=g.split(/<br\s*\/?>|<img/i);const t=stripHtml(m[0]).trim();const sub=ro!=null?stripHtml(ro).trim():stripHtml(g.slice(m[0].length)).trim();
  return {t:t||(/<img/i.test(f)?L('(ảnh)','(image)'):''),sub,im:!t&&/<img/i.test(f)}}
function renderFlipList(){
  const F=FV,N=F.items.length,pos=Math.min(S.flipPos[F.key]||0,F.all.length-1);
  const idx=new Map(F.items.map((c,k)=>[c,k]));
  const groups=F.shuf?[{id:'*',name:L('Đã trộn thứ tự','Shuffled'),cards:F.items}]:F.secs.map(x=>({id:x.id,name:x.name,cards:F.items.filter(c=>c.deck===x.id)})).filter(g=>g.cards.length);
  const multi=groups.length>1;
  const row=c=>{const k=idx.get(c),T=cardTitle(c),st=isStar(c);
    const here=!F.only&&!F.shuf&&F.all[pos]===c&&pos>0;
    return `<div class="frow ${st?'st':''} ${here?'here':''}" data-fi="${k}">${here?`<span class="fhere">${L('đang dở','last here')}</span>`:''}<span class="fno">${k+1}</span>${T.im?`<div class="fth" data-th="${k}"></div>`:''}<div class="ftx"><div class="jp">${esc(T.t)}</div>${T.sub?`<small>${esc(T.sub)}</small>`:''}</div><button class="fstar ${st?'on':''}" data-fst="${k}" aria-label="★">★</button></div>`};
  full(`${flipTop(`<b>${N}</b><span class="tiny"> ${L('thẻ','cards')}${multi?` · ${groups.length} ${L('mục','sections')}`:''}</span>`)}
   <div class="flist">
    <div class="flhero">${dog('perch','fldog','search')}<div class="flh-k">${L('Bộ tự lướt','Flip deck')}</div><div class="flh-t">${esc(F.title)}</div>
      <div class="flh-s">${F.all.length} ${L('thẻ','cards')}${multi?` · ${groups.length} ${L('mục','sections')}`:''} · ★ ${F.all.filter(isStar).length}${pos>0?` · ${L('đang ở thẻ','at card')} ${pos+1}`:''}</div>
      <div class="tiny flh-h">${L('Chạm thẻ nào thì lướt từ thẻ đó. Vuốt lên trên thẻ để đánh dấu ★ chưa thuộc.','Tap any card to start there. Swipe up to ★.')}</div>
      <div class="meter flh-m"><i style="width:${F.all.length?(pos+1)/F.all.length*100:0}%"></i></div>
</div>
    ${N?groups.map((g,gi)=>{const open=!multi||!F.col.has(g.id);const ns=g.cards.filter(isStar).length;
      return `<section class="fsec c${gi%6+1}">${multi?`<button class="fsh" data-sec="${esc(g.id)}"><span class="car">${open?'▾':'▸'}</span><b>${esc(g.name)}</b><span class="tiny">${g.cards.length} ${L('thẻ','cards')}${ns?` · ★ ${ns}`:''}</span></button>`:''}
       ${open?`<div class="frows">${g.cards.map(row).join('')}</div>`:''}</section>`}).join('')
      :`<div class="card center tiny">${L('Chưa có thẻ ★ nào.','No starred cards.')}</div>`}
   </div>`);
  bindFlipTop();
  $('#fvq').onclick=()=>{FV=null;TAB='home';render()};
  $$('[data-fi]').forEach(b=>b.onclick=e=>{if(e.target.closest('[data-fst]'))return;F.i=+b.dataset.fi;F.view='card';F.show=false;render()});
  $$('[data-fst]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const c=F.items[+b.dataset.fst],on=!isStar(c);await setStar(c,on);b.classList.toggle('on',on);b.closest('.frow').classList.toggle('st',on);const s=$('#fvonly small');if(s)s.textContent=F.all.filter(isStar).length});
  $$('[data-sec]').forEach(b=>b.onclick=e=>{if(e.target.closest('[data-sgo]')){F.i=+e.target.closest('[data-sgo]').dataset.sgo;F.view='card';F.show=false;return render()}
    const id=b.dataset.sec;F.col.has(id)?F.col.delete(id):F.col.add(id);ls.set('shiratama-fcol:'+F.name,[...F.col]);const y=$('.flist').scrollTop;renderFlipList();$('.flist').scrollTop=y});
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;io.unobserve(e.target);const c=F.items[+e.target.dataset.th];
    const m=String(c.front).match(/<img[^>]*>/i);if(m){e.target.innerHTML=m[0];ANKI.hydrate(e.target)}}),{rootMargin:'300px'});
  $$('[data-th]').forEach(x=>io.observe(x));
}
function renderFlipCard(){
  const F=FV,N=F.items.length;if(!N){F.view='list';return renderFlipList()}
  const it=F.items[F.i],cfg=flipCfg(),two=hasBack(it);
  const sec=F.secs.length>1?(F.secs.find(x=>x.id===it.deck)||{}).name:'';
  full(`${flipTop(`<b>${F.i+1}</b><span class="tiny"> / ${N}${sec?` · ${esc(sec)}`:''}</span>`)}
   <div class="prog"><i style="width:${Math.round((F.i+1)/N*100)}%"></i></div>
   ${autoBarHTML(F.auto,cfg.q,cfg.a,null,{always:true})}
   <div class="deckwrap flipwrap" id="akwrap"><div class="stage fvstage" id="stage"><div class="fc ${F.show?'flip':''} ${/class="gt"/.test(it.front)&&!hasBack(it)?'imgonly':''}" id="fc"><div class="face front"><div class="fin">${it.front}</div></div><div class="face back"><div class="fin">${backHTML(it)}</div></div></div>
     <span class="starmark ${isStar(it)?'on':''}" id="fvstar" aria-hidden="true">★</span><svg class="aring" id="aring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg><span class="fmore" id="fmore"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></div>
</div>`);
  ANKI.hydrate($('#fc'));
  bindFlipTop();bindSizeBtn(()=>setTimeout(moreHint,30));
  const ring=sec=>{const r=$('#aring');if(!r)return;r.classList.remove('run');void r.getBBox();r.style.setProperty('--t',sec+'s');r.classList.add('run')};
  const unring=()=>{const r=$('#aring');if(r)r.classList.remove('run')};
  const go=k=>{clearTimeout(F.at);if(k>=N){F.auto=false;F.view='list';toast(L('Hết lượt lướt','End of deck'));render();return}if(k<0)return;
    F.i=k;F.show=false;if(!F.shuf&&!F.only){S.flipPos[F.key]=F.all.indexOf(F.items[k]);save()}renderFlipCard()};
  const next=()=>go(F.i+1),prev=()=>go(F.i-1);
  const flip=()=>{if(!two)return;F.show=!F.show;SFX.play('flip');$('#fc').classList.toggle('flip',F.show);arm()};
  const star=async(adv)=>{const on=!isStar(it);await setStar(it,on);const b=$('#fvstar');if(b)b.classList.toggle('on',on);const s=$('#fvonly small');if(s)s.textContent=F.all.filter(isStar).length;
    toast(on?L('Đã đánh dấu ★ chưa thuộc','Starred'):L('Đã bỏ ★','Unstarred'));if(adv)setTimeout(next,250)};
  const arm=()=>{clearTimeout(F.at);if(!F.auto)return unring();
    if(!two){ring(cfg.q);F.at=setTimeout(()=>toNext(),cfg.q*1000);return}
    if(!F.show){ring(cfg.q);F.at=setTimeout(()=>{if(FV===F&&!F.show)flip()},cfg.q*1000)}else{ring(cfg.a);F.at=setTimeout(()=>toNext(),cfg.a*1000)}};
  bindAutoBar($('#abar'),{get on(){return F.auto},set on(v){F.auto=v;arm()},get q(){return cfg.q},get a(){return cfg.a},
    set(k,v){if(k==='autoQ')cfg.q=v;else cfg.a=v;save()}});
  $('#fvq').onclick=()=>{clearTimeout(F.at);F.auto=false;F.view='list';render()};
  // quẹt: thẻ chạy theo tay rồi bay đi
  const stage=$('#stage'),fc=$('#fc');let sx=0,sy=0,down=false,busy=false;
  const ry=()=>F.show?' rotateY(180deg)':'';
  const fly=(dir,then)=>{if(busy)return;busy=true;clearTimeout(F.at);fc.style.transition='transform .26s ease-in,opacity .26s';
    fc.style.transform=dir==='u'?`translateY(-115%) scale(.9)${ry()}`:`translateX(${dir==='l'?-125:125}%) rotate(${dir==='l'?-14:14}deg)${ry()}`;fc.style.opacity='0';
    SFX.play(dir==='u'?'ok':'flip');setTimeout(then,220)};
  const toNext=()=>{if(F.i>=N-1)return next();fly('l',next)},toPrev=()=>{if(!F.i){snap();return}fly('r',prev)};
  const snap=()=>{fc.style.transition='transform .25s cubic-bezier(.3,1.5,.5,1)';fc.style.transform=F.show?'rotateY(180deg)':''};
  const face=()=>fc.querySelector(F.show?'.back':'.front');
  const atEnd=el=>el.scrollTop+el.clientHeight>=el.scrollHeight-3;
  const moreHint=()=>{const el=face(),m=$('#fmore');if(!el||!m)return;m.classList.toggle('on',el.scrollHeight>el.clientHeight+4&&!atEnd(el))};
  fc.querySelectorAll('.face').forEach(f=>f.addEventListener('scroll',moreHint,{passive:true}));
  setTimeout(moreHint,60);setTimeout(moreHint,600);fc.addEventListener('transitionend',moreHint);
  // cảm ứng: kéo dọc = cuộn nội dung thẻ; hết nội dung mới tính vuốt lên ★; kéo ngang = chuyển thẻ
  let T=null,vel=0,raf=0;
  const glide=el=>{cancelAnimationFrame(raf);const step=()=>{if(Math.abs(vel)<.3)return;el.scrollTop+=vel;vel*=.94;raf=requestAnimationFrame(step)};raf=requestAnimationFrame(step)};
  stage.addEventListener('touchstart',e=>{if(busy||e.touches.length>1||e.target.closest('a,button,input')){T=null;return}cancelAnimationFrame(raf);const t=e.touches[0],el=face();
    T={x:t.clientX,y:t.clientY,ly:t.clientY,lt:performance.now(),mode:null,el,st:el.scrollTop,end0:atEnd(el)};fc.style.transition='none'},{passive:true});
  stage.addEventListener('touchmove',e=>{if(!T)return;const t=e.touches[0],dx=t.clientX-T.x,dy=t.clientY-T.y;
    if(!T.mode){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      T.mode=Math.abs(dx)>Math.abs(dy)?'h':(dy<0&&T.end0?'u':'v')}
    e.preventDefault();
    if(T.mode==='v'){const now=performance.now();T.el.scrollTop=T.st-dy;vel=(T.ly-t.clientY)/Math.max(1,now-T.lt)*16;T.ly=t.clientY;T.lt=now;return}
    if(T.mode==='u'){fc.style.transform=`translateY(${Math.min(0,dy)}px)${ry()}`;return}
    fc.style.transform=`translateX(${dx}px) rotate(${dx/26}deg)${ry()}`;fc.classList.toggle('tint-r',dx>50);fc.classList.toggle('tint-l',dx<-50)},{passive:false});
  stage.addEventListener('touchend',e=>{if(!T)return;const t=e.changedTouches[0],dx=t.clientX-T.x,dy=t.clientY-T.y,m=T.mode,el=T.el;T=null;fc.classList.remove('tint-r','tint-l');
    if(m==='v'){snap();glide(el);return}
    if(m==='u'){if(-dy>70){const on=!isStar(it);setStar(it,on).then(()=>{const s=$('#fvonly small');if(s)s.textContent=F.all.filter(isStar).length});toast(on?L('Đã đánh dấu ★ chưa thuộc','Starred'):L('Đã bỏ ★','Unstarred'));return fly('u',()=>go(F.i+1))}return snap()}
    if(m==='h'){if(Math.abs(dx)>60)return dx<0?toNext():toPrev();return snap()}
    snap();if(!two){const r=stage.getBoundingClientRect();return t.clientX>r.left+r.width/2?toNext():toPrev()}
    flip();setTimeout(moreHint,450)});
  stage.addEventListener('touchcancel',()=>{T=null;snap()});
  stage.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||busy||e.target.closest('a,button,input'))return;sx=e.clientX;sy=e.clientY;down=true;fc.style.transition='none';stage.setPointerCapture(e.pointerId)});
  stage.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)<6&&Math.abs(dy)<6)return;
    const up=-dy>Math.abs(dx);fc.style.transform=up?`translateY(${Math.min(0,dy)}px)${ry()}`:`translateX(${dx}px) rotate(${dx/26}deg)${ry()}`;
    fc.classList.toggle('tint-r',!up&&dx>50);fc.classList.toggle('tint-l',!up&&dx<-50)});
  const end=e=>{if(!down)return;down=false;fc.classList.remove('tint-r','tint-l');const dx=e.clientX-sx,dy=e.clientY-sy;
    if(-dy>70&&-dy>Math.abs(dx)){const on=!isStar(it);setStar(it,on).then(()=>{const s=$('#fvonly small');if(s)s.textContent=F.all.filter(isStar).length});toast(on?L('Đã đánh dấu ★ chưa thuộc','Starred'):L('Đã bỏ ★','Unstarred'));return fly('u',()=>go(F.i+1))}
    if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))return dx<0?toNext():toPrev();
    snap();if(Math.abs(dx)>12||Math.abs(dy)>12)return;
    if(!two){const r=stage.getBoundingClientRect();return e.clientX>r.left+r.width/2?toNext():toPrev()}
    flip();setTimeout(moreHint,450)};
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',()=>{down=false;snap()});
  F.key=e=>{if(e.target.closest&&e.target.closest('input,textarea,select'))return;
    if(e.key==='ArrowRight'){e.preventDefault();toNext()}else if(e.key==='ArrowLeft'){e.preventDefault();toPrev()}
    else if(e.key==='s'||e.key==='S'||e.key==='ArrowUp'){e.preventDefault();star(false)}
    else if(e.key===' '||e.key==='Enter'){e.preventDefault();two?flip():toNext()}else if(e.key==='Escape')$('#fvq').click()};
  arm();
}

function render(){
  stopAudio();applyLook();
  if(!DATA)return lockScreen();
  if(SS)return renderSession();
  if(AK)return renderAnki();
  if(FV)return renderFlip();
  document.body.classList.remove('editing');({home,browse,exam:examList,stats,examstats:examStats,sys}[TAB]||home)();
}

/* ---------- lock ---------- */
function lockScreen(err){
  shell(`${header()}<div class="card center" style="margin-top:24px">${dog('big','','wave')}
  <p style="font-size:22px;font-weight:800;margin:0 0 4px">${L('Chào anh','Welcome')}</p><p class="muted small" style="margin:0 0 16px">${L('Nhập mã để mở bộ đề. Mỗi máy chỉ cần nhập một lần.','Enter your code to unlock the tests. Once per device.')}</p>
  <input class="field" id="code" placeholder="${L('Mã của anh','Your code')}" autocomplete="off" autocapitalize="off" spellcheck="false">
  ${err?`<p class="small" style="color:var(--ng)">${esc(err)}</p>`:''}
  <button class="btn bee" id="open" style="width:100%;margin-top:14px">${L('Mở','Open')}</button></div>`,{tabs:false});
  const go=async()=>{const c=$('#code').value;if(!c)return;$('#open').disabled=true;$('#open').textContent=L('Đang mở…','Opening…');
    try{DATA=await loadContent(c);ls.set('shiratama-code',c);indexData();await openBundle(c);render();SYNC.start(c)}catch(e){lockScreen(L('Mã không đúng, hoặc chưa tải được đề.','Wrong code, or the tests could not be loaded.'))}};
  $('#open').onclick=go;$('#code').onkeydown=e=>{if(e.key==='Enter')go()};
}

/* ---------- đề thi ---------- */
function examInfo(e){const H=S.exams[e.id]||[];const n=e.qs.length,d=e.qs.filter(q=>S.ans[q.id]).length;
  const parts=e.parts.map(p=>{const h=H.filter(x=>x.name===p.name);const best=h.length?h.reduce((m,x)=>x.c/x.n>m.c/m.n?x:m):null;return {p,best}});
  return {n,d,parts,started:parts.some(x=>x.best)||d>0,done:parts.every(x=>x.best)}}
const PSHORT={'moji':['Từ vựng','Vocabulary'],'bunpou+dokkai':['Ngữ pháp · Đọc','Grammar · Reading'],'choukai':['Nghe','Listening']};
function ring(pct,size=54){const r=(size-8)/2,c=2*Math.PI*r;return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" class="rb"/><circle cx="${size/2}" cy="${size/2}" r="${r}" class="rf" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct)}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle">${Math.round(pct*100)}%</text></svg>`}
let EXD=null; // đề đang mở (null = danh sách đề)
function examList(){
  const exs=examsSorted();
  if(EXD&&exs.find(e=>e.id===EXD))return examDetail(exs.find(e=>e.id===EXD));
  const info=new Map(exs.map(e=>[e,examInfo(e)]));
  const next=exs.find(e=>!info.get(e).done)||exs[0];const ni=info.get(next);const np=ni.parts.find(x=>!x.best)||ni.parts[0];
  const doneN=exs.filter(e=>info.get(e).done).length,startedN=exs.filter(e=>info.get(e).started).length;
  const years={};exs.forEach(e=>{const y=(e.short||'').split('/')[1]||'—';(years[y]=years[y]||[]).push(e)});
  const card=e=>{const I_=info.get(e),[m]=(e.short||'').split('/');const pct=I_.n?I_.d/I_.n:0;
    return `<button class="excard m${m}" data-exo="${esc(e.id)}">
      <div class="exc-top"><div><small>${L('Tháng','Month')}</small><b>${esc(m)}</b></div>${ring(pct)}</div>
      <div class="exc-parts">${I_.parts.map(({p,best})=>{const v=best?best.c/best.n:0;return `<div class="exc-p"><span>${esc(LL(PSHORT[p.key])||partName(p))}</span><i class="mb"><i class="${best?(v>=.6?'ok':'ng'):''}" style="width:${best?v*100:0}%"></i></i><b>${best?`${best.c}/${best.n}`:'—'}</b></div>`}).join('')}</div>
    </button>`};
  shell(`${header()}
  <div class="exhero">
    <div class="exh-l">
      <button class="exh-k" id="exday">${daysLeft()===null?L('Đặt ngày thi để đếm ngược','Set your exam date'):`${L('Còn','')} <b>${daysLeft()}</b> ${L('ngày tới kỳ thi','days to')} ${esc(examName())}`} <span class="edit">✎</span></button>
      <div class="exh-t">${L('Nên làm tiếp','Up next')}: ${L('đề','test')} ${esc(exShort(next))}</div>
      <div class="exh-s">${L('Phần','Section')} ${esc(partName(np.p))} · ${partQs(next,np.p).length} ${L('câu','Qs')} · ${np.p.min} ${L('phút','min')}</div>
      <div class="row wrapbtn" style="margin-top:14px"><button class="btn bee" id="exgo">${L('Thi thật phần này','Start timed')}</button><button class="btn line" id="exopen">${L('Xem cả đề','Open test')}</button></div>
    </div>
    <div class="exh-r">
      <div class="exh-st"><b>${doneN}<small>/${exs.length}</small></b><span>${L('đề đã làm đủ 3 phần','tests fully done')}</span></div>
      <div class="exh-st"><b>${startedN}</b><span>${L('đề đã bắt đầu','tests started')}</span></div>
    </div>
  </div>
  ${Object.keys(years).sort((a,b)=>b.localeCompare(a)).map(y=>`<section class="exyear"><h3>${esc(y)}</h3><div class="exgrid">${years[y].map(card).join('')}</div></section>`).join('')}
  <section class="exyear"><h3>${L('Luyện theo phần','Practice by section')} <small>${L('trộn câu từ mọi đề','mixed from all tests')}</small></h3>
  <div class="secgrid">${Object.keys(SEC).map(k=>{const qs=allBy(k);const t=qs.filter(q=>S.ans[q.id]).length;return `<button class="sec" data-prac="${k}"><div style="font-weight:800">${secName(k)}</div><div class="tiny" style="margin-top:6px">${t}/${qs.length} ${L('câu đã làm','done')}</div></button>`}).join('')}</div></section>
  `);
  $$('[data-exo]').forEach(b=>b.onclick=()=>{EXD=b.dataset.exo;S.exSel=EXD;save();examList()});
  $$('[data-prac]').forEach(b=>b.onclick=()=>startPractice(b.dataset.prac));
  $('#exgo').onclick=()=>startExam(next,np.p,true);
  $('#exopen').onclick=()=>{EXD=next.id;examList()};
  $('#exday').onclick=()=>examDayDialog(examList);
}
function examDetail(ex){
  const hist=(S.exams[ex.id]||[]).slice(-5).reverse();
  shell(`${header()}
  <button class="btn line sm exback" id="exback">‹ ${L('Tất cả đề','All tests')}</button>
  <div class="card"><div style="font-size:21px;font-weight:800">${esc(examTitle(ex))}</div><div class="tiny" style="margin-top:2px">${esc(ex.note?L(ex.note,ex.note):'')}</div></div>
  ${ex.parts.map((p,i)=>{const qs=partQs(ex,p);return `<div class="card"><div style="font-size:17px;font-weight:800">${partName(p)}</div><div class="tiny">${qs.length} ${L('câu','questions')} · ${p.min} ${L('phút','min')}</div>
   <div class="row" style="margin-top:12px"><button class="btn bee" data-ex="${i}">${L('Thi thật','Timed test')}</button><button class="btn line" data-exp="${i}">${L('Luyện từng câu','One by one')}</button></div></div>`}).join('')}
  ${hist.length?`<div class="h">${L('Lần làm gần đây','Recent attempts')}</div><div class="card">${hist.map(h=>`<div class="list-item"><div class="grow"><div>${esc(partName(ex.parts.find(p=>p.name===h.name)||{name:h.name}))}</div><div class="tiny">${new Date(h.at).toLocaleString(L('vi-VN','en-GB'))}</div></div><b>${h.c}/${h.n}</b></div>`).join('')}</div>`:''}
  `);
  $('#exback').onclick=()=>{EXD=null;examList()};
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
  const qimg=q.img&&ex.imgs&&ex.imgs[q.img]?`<img class="qimg" src="${ex.imgs[q.img]}" alt="">`:'';
  const stem=qimg+(hideStem?`<div class="stem muted" style="font-size:15px">${L('Nghe để biết câu hỏi','Listen for the question')}</div>`:`<div class="stem">${rich(q.q)}</div>`);
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
  const qpane=`${q.audio?audioHTML(q):''}<div class="qmeta"><span class="pill src">${esc(srcLabel(q,ex))}</span><span class="pill">${esc(typeName(q))}</span></div>${stem}${verdict}<div class="opts">${opts}</div>${after}${nav}`;
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
   <div class="h">${L('Xem lại từng câu','Review each question')}</div><div class="card">${s.qs.map((q,k)=>{const ok=s.picks[q.id]===q.a;return `<div class="list-item" data-rv="${k}" style="cursor:pointer"><span class="pill" style="color:${ok?'var(--ok)':'var(--ng)'}">${ok?'○':'×'}</span><div class="grow jp" style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(plain(q.q))}<div class="tiny" style="font-family:inherit">${esc(srcLabel(q,QI[q.id].ex))}</div></div><span class="tiny">${s.picks[q.id]!=null?s.picks[q.id]+1:'–'} → ${q.a+1}</span></div>`}).join('')}</div>`,{tabs:false});
  $('#back').onclick=()=>{TAB='home';render()};
  $$('[data-rv]').forEach(b=>b.onclick=()=>{SS=Object.assign({},s,{kind:'view',i:+b.dataset.rv,back:s});renderSession()});
}

/* ---------- bộ thẻ (giống Anki) ---------- */
let ST=null; // {decks, cards}
async function ankiState(force){if(!window.ANKI)return {decks:[],cards:[]};if(ST&&!force)return ST;const [decks,cards]=await Promise.all([ANKI.all('decks'),ANKI.all('cards')]);ST={decks,cards};return ST}
const dropState=()=>{ST=null};
function dayHour(){const h=+S.dayHour;return Number.isInteger(h)&&h>=0&&h<24?h:4}
function dayEnd(){const d=new Date();const e=new Date(d);e.setHours(dayHour(),0,0,0);if(e<=d)e.setDate(e.getDate()+1);return e.getTime()}
const dayKey=()=>new Date(dayEnd()-864e5).toDateString();
function isDue(c,now,de){if(c.card.state===0)return false;const t=new Date(c.card.due).getTime();return c.card.state===2?t<=de:t<=now+20*60000}

/* ---- cài đặt (preset) giống Anki ---- */
const PDEF={name:'Default',newDay:9999,revDay:9999,learn:[1,10],relearn:[10],gradIvl:1,minLapse:1,leechN:8,leechAct:'tag',
  newOrder:'added',revOrder:'due',mix:'before',buryNew:false,buryRev:false,showTimer:false,capSec:60,autoQ:6,autoA:4,autoAct:'again',ret:0.9,maxIvl:36500,w:''};
function presets(){let p=ls.get('shiratama-presets',null);if(!p||!p['1']){p=Object.assign({'1':Object.assign({},PDEF)},p||{});ls.set('shiratama-presets',p)}return p}
function savePresets(p){ls.set('shiratama-presets',p)}
function presetOf(d){const p=presets();return Object.assign({},PDEF,p[(d&&d.cfgId)||'1']||p['1'])}
function daily(){const k=dayKey();if(!S.daily||S.daily.day!==k)S.daily={day:k,n:0,ms:0,again:0,nw:{},rv:{}};return S.daily}
function deckTree(st){
  const nodes={};const get=name=>nodes[name]||(nodes[name]={name,id:null,kids:[],cards:[]});
  st.decks.forEach(d=>{const n=get(d.name);n.id=d.id;n.deck=d;const parts=d.name.split('::');for(let i=1;i<parts.length;i++){const p=parts.slice(0,i).join('::'),c=parts.slice(0,i+1).join('::');const pn=get(p);if(!pn.kids.includes(c))pn.kids.push(c);get(c)}});
  const ord=n=>{const d=nodes[n].deck;return d&&d.ord!=null?d.ord:1e9};const cmp=(a,b)=>ord(a)-ord(b)||a.localeCompare(b);
  const roots=Object.keys(nodes).filter(n=>!n.includes('::')).sort(cmp);
  Object.values(nodes).forEach(n=>n.kids.sort(cmp));
  return {nodes,roots};
}
function nodeSet(st,tree,name){const s=new Set();const walk=n=>{const x=tree.nodes[n];if(x.id)s.add(x.id);x.kids.forEach(walk)};walk(name);return s}
function retr(c,now){const k=c.card;if(!k.stability||!k.last_review)return 1;const t=Math.max(0,(now-new Date(k.last_review))/864e5);return Math.pow(1+19/81*t/k.stability,-0.5)}
function ankiQueue(cards,deckSet,decks,topName){
  const now=Date.now(),de=dayEnd(),dk=dayKey(),D=daily();
  const byId={};(decks||[]).forEach(d=>byId[d.id]=d);
  const fl=flipIds(decks||[]);
  const mine=cards.filter(c=>!c.susp&&c.buried!==dk&&!fl.has(c.deck)&&(!deckSet||deckSet.has(c.deck)));
  const learn=[],rev=[],fresh=[];
  mine.forEach(c=>{const st=c.card.state;if(st===0)fresh.push(c);else if(isDue(c,now,de))(st===2?rev:learn).push(c)});
  const top=topName&&decks?decks.find(d=>d.name===topName):null;const TP=presetOf(top);
  // giới hạn mỗi ngày theo từng deck
  const cap=(list,key,field)=>{const used={};return list.filter(c=>{const P=presetOf(byId[c.deck]);const lim=P[field];used[c.deck]=(used[c.deck]||0)+1;return used[c.deck]+((D[key]||{})[c.deck]||0)<=lim})};
  let R=rev.slice();
  if(TP.revOrder==='random')R=shuffle(R);else if(TP.revOrder==='retr')R.sort((a,b)=>retr(a,now)-retr(b,now));else R.sort((a,b)=>new Date(a.card.due)-new Date(b.card.due));
  R=cap(R,'rv','revDay');
  let N=fresh.slice();N.sort((a,b)=>(a.created||parseInt(String(a.id).slice(1),10)||0)-(b.created||parseInt(String(b.id).slice(1),10)||0));if(TP.newOrder==='random')N=shuffle(N);
  N=cap(N,'nw','newDay');
  if(top){R=R.slice(0,TP.revDay);N=N.slice(0,TP.newDay)}
  learn.sort((a,b)=>new Date(a.card.due)-new Date(b.card.due));
  return {due:learn.concat(R),learn,rev:R,fresh:N,mix:TP.mix};
}

let SORTING=false;
function home(){
  shell(`${header()}<div id="ankiBox" class="homegrid"><div class="card tiny">${L('Đang đọc thẻ…','Loading cards…')}</div></div>`);
  ankiBox();
}
async function ankiBox(){
  const box=$('#ankiBox');if(!box)return;
  let st;try{st=await ankiState()}catch(e){box.innerHTML=`<div class="muted small">${L('Trình duyệt chặn bộ nhớ, chưa dùng được phần thẻ.','The browser blocks storage, cards are unavailable.')}</div>`;return}
  if(!document.body.contains(box))return;
  const tree=deckTree(st);const tot=ankiQueue(st.cards,null,st.decks);
  const col=S.collapsed||{};const D=daily();
  const row=(name,depth)=>{const n=tree.nodes[name];const set=nodeSet(st,tree,name);const q=ankiQueue(st.cards,set,st.decks,name);const kids=n.kids.length;const short=name.split('::').pop();
    let h=`<div class="deckrow" style="--d:${depth}">
      ${kids?`<button class="tw" data-tw="${esc(name)}" aria-label="${L('Mở/đóng','Toggle')}">${col[name]?'▸':'▾'}</button>`:'<span class="tw"></span>'}
      ${modeOf(name,st.decks)==='flip'?`<button class="dn" data-flipd="${esc(name)}">${esc(short)}</button><span class="dflip">${st.cards.filter(c=>!c.susp&&set.has(c.deck)).length} ${L('thẻ · lướt','cards · flip')}</span>`
       :`<button class="dn" data-study="${esc(name)}">${esc(short)}</button>
      <span class="dc new">${q.fresh.length||''}</span><span class="dc lrn">${q.learn.length||''}</span><span class="dc due">${q.rev.length||''}</span>`}
      ${SORTING?`<span class="dsort"><button class="iconbtn sm" data-mv="${esc(name)}" data-d="-1" aria-label="${L('Lên','Up')}">↑</button><button class="iconbtn sm" data-mv="${esc(name)}" data-d="1" aria-label="${L('Xuống','Down')}">↓</button></span>`
       :`<button class="iconbtn sm" data-opt="${esc(name)}" aria-label="${L('Tùy chọn deck','Deck options')}">${I.dots}</button>`}</div>`;
    if(kids&&!col[name])n.kids.forEach(k=>h+=row(k,depth+1));return h};
  const nAll=tot.due.length+tot.fresh.length;
  box.innerHTML=`<div class="hcol">
   <div class="card hero">${dog('perch','hdog')}
     <div class="tiny">${L('Hôm nay cần học','Due today')}</div>
     <div class="hero-n">${nAll}<span> ${L('thẻ','cards')}</span></div>
     <div class="hero-split"><span><i class="dot nw"></i>${L('Mới','New')} <b>${tot.fresh.length}</b></span><span><i class="dot ln"></i>${L('Đang học','Learning')} <b>${tot.learn.length}</b></span><span><i class="dot rv"></i>${L('Ôn','Review')} <b>${tot.rev.length}</b></span></div>
     <button class="btn bee big" id="ankiAll" ${nAll?'':'disabled'}>${nAll?L('Học ngay','Study now'):L('Xong hết rồi','All done')}</button>
     <div class="tiny center" style="margin-top:10px">${L(`Đã học ${D.n} thẻ · ${Math.round(D.ms/60000)} phút hôm nay`,`${D.n} cards · ${Math.round(D.ms/60000)} min today`)}</div>
   </div>
   <div class="tools">
     <button class="tool" id="goBr">${I.search}<span>${L('Duyệt thẻ','Browse')}</span></button>
     <button class="tool" id="addC">${I.plus}<span>${L('Thêm thẻ','Add')}</span></button>
     <button class="tool" id="newD">${I.folder}<span>${L('Tạo deck','New deck')}</span></button>
     <button class="tool" id="ankiImp">${I.upload}<span>${L('Nhập .apkg','Import')}</span></button>
   </div>
   <div class="tiny" id="impMsg"></div></div>
   <div class="card deckcard">
   ${st.cards.length?`<div class="deckhead"><span class="grow">Deck <button class="sortbtn ${SORTING?'on':''}" id="dsortbtn">${SORTING?L('Xong','Done'):L('Sắp xếp','Reorder')}</button></span><span class="dc new">${L('Mới','New')}</span><span class="dc lrn">${L('Học','Learn')}</span><span class="dc due">${L('Ôn','Due')}</span><span style="width:34px"></span></div>
   <div class="decks">${tree.roots.map(r=>row(r,0)).join('')}</div>`:`<p class="muted small" style="margin:0">${L('Chưa có thẻ nào.','No cards yet.')}</p>`}
   </div>`;
  const a=$('#ankiAll');if(a)a.onclick=()=>startAnki(null,null);
  const hd=$('#hdog');if(hd){hd.onclick=()=>{dogDo(hd,'hop');sprAct(hd,'talk',1900);SFX.play(Math.random()<.5?'woof':'buzz');const l=DOG_LINES();dogSay(hd,l[Math.floor(Math.random()*l.length)])};
    if(!S.greetDay||S.greetDay!==dayKey()){S.greetDay=dayKey();save();setTimeout(()=>dogSay(hd,nAll?L(`Hôm nay có ${nAll} thẻ đợi anh nè!`,`${nAll} cards are waiting today!`):L('Hôm nay xong hết rồi, giỏi ghê!','All done for today!'),4200),600)}}
  $$('[data-tw]').forEach(b=>b.onclick=()=>{S.collapsed=S.collapsed||{};S.collapsed[b.dataset.tw]=!S.collapsed[b.dataset.tw];save();ankiBox()});
  $$('[data-study]').forEach(b=>b.onclick=()=>startAnki(nodeSet(st,tree,b.dataset.study),b.dataset.study));
  $$('[data-flipd]').forEach(b=>b.onclick=()=>startFlipDeck(st,nodeSet(st,tree,b.dataset.flipd),b.dataset.flipd));
  $$('[data-opt]').forEach(b=>b.onclick=()=>deckOptions(b.dataset.opt));
  const sb=$('#dsortbtn');if(sb)sb.onclick=()=>{SORTING=!SORTING;if(SORTING)toast(L('Bấm ↑ ↓ để đổi thứ tự. Muốn bỏ deck vào deck khác thì vào ⋯ của deck.','Use ↑ ↓ to reorder. To nest a deck, use its ⋯ menu.'));ankiBox()};
  $$('[data-mv]').forEach(b=>b.onclick=()=>moveDeck(st,b.dataset.mv,+b.dataset.d));
  $('#addC').onclick=()=>addCards();
  $('#goBr').onclick=()=>{TAB='browse';S.lastStudy='browse';save();BR.sel=null;render()};
  $('#newD').onclick=()=>newDeckDialog(st);
  $('#ankiImp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.apkg,.colpkg';i.onchange=async()=>{const msg=$('#impMsg');
    try{const r=await ANKI.importApkg(i.files[0],t=>msg.textContent=t);msg.textContent=L(`Đã nhập ${r.cards} thẻ từ ${r.decks} deck, giữ nguyên lịch ôn.`,`Imported ${r.cards} cards from ${r.decks} decks.`);dropState();setTimeout(ankiBox,1500)}
    catch(e){msg.textContent=L('Không nhập được: ','Import failed: ')+e.message}};i.click()};
}

/* ---------- tùy chọn deck (theo Anki) ---------- */
const stepsTxt=a=>(a||[]).map(m=>m>=1440&&m%1440===0?(m/1440)+'d':m>=60&&m%60===0?(m/60)+'h':m+'m').join(' ');
function parseSteps(s){return String(s||'').trim().split(/[\s,]+/).filter(Boolean).map(t=>{const m=t.match(/^(\d+(?:\.\d+)?)([smhd]?)$/i);if(!m)return null;const v=+m[1],u=(m[2]||'m').toLowerCase();return u==='s'?v/60:u==='h'?v*60:u==='d'?v*1440:v}).filter(x=>x!=null&&x>0)}
const H=t=>`<div class="ohint">${t}</div>`;
async function deckOptions(name){
  const st=await ankiState();const tree=deckTree(st);const node=tree.nodes[name];
  let d=node.deck;if(!d){d={id:'d'+Date.now(),name,at:Date.now(),cfgId:'1'};await ANKI.put('decks',d)}
  const set=nodeSet(st,tree,name);const cards=st.cards.filter(c=>set.has(c.deck));
  let P=presets();let pid=String(d.cfgId||'1');
  const v=document.createElement('div');v.className='veil';
  const close=()=>{v.remove();dropState();render()};
  const opt=(id,val,list)=>`<select class="field" id="${id}">${list.map(([k,l])=>`<option value="${k}" ${String(val)===String(k)?'selected':''}>${l}</option>`).join('')}</select>`;
  const sw=(id,on,label,help)=>`<label class="chk"><input type="checkbox" id="${id}" ${on?'checked':''}> <span>${label}${help?`<span class="tiny" style="display:block">${help}</span>`:''}</span></label>`;
  const used=pid=>st.decks.filter(x=>String(x.cfgId||'1')===pid).length;
  const draw=()=>{const c=Object.assign({},PDEF,P[pid]);
    v.innerHTML=`<div class="panel wide opts-panel">
   <div class="row" style="margin-bottom:6px"><div class="grow" style="font-weight:800;font-size:18px;overflow:hidden;text-overflow:ellipsis">${L('Cài đặt deck','Deck options')}: ${esc(name)}</div><button class="iconbtn" id="ox">${I.x}</button></div>
   <div class="tiny">${cards.length} ${L('thẻ','cards')} · ${cards.filter(c=>c.card.state===0).length} ${L('thẻ chưa học','new')} · ${cards.filter(c=>c.susp).length} ${L('thẻ đang ẩn','suspended')}</div>
   <div class="osec"><div class="ot">${L('Bộ cài đặt dùng chung','Preset')}</div>
     <div class="row">${opt('opre',pid,Object.entries(P).map(([k,x])=>[k,`${esc(x.name)} (${L('đang dùng cho','used by')} ${used(k)} deck)`]))}<button class="iconbtn sm" id="opmenu" aria-label="Preset">${I.dots}</button></div>
     ${H(L('Nhiều deck có thể dùng chung một bộ cài đặt. Sửa ở đây là các deck đó đổi theo.','Several decks can share one preset. Changes apply to all of them.'))}
     <div class="row wrapbtn" id="opacts" style="display:none;margin-top:8px"><button class="btn line sm" data-pa="add">${L('Tạo bộ mới','Add preset')}</button><button class="btn line sm" data-pa="clone">${L('Sao chép bộ này','Clone')}</button><button class="btn line sm" data-pa="ren">${L('Đổi tên','Rename')}</button><button class="btn line sm" data-pa="del" style="color:var(--ng)">${L('Xóa bộ','Delete')}</button></div></div>
   <div class="osec"><div class="ot">${L('Mỗi ngày học bao nhiêu','How much per day')}</div>
     <label class="lab">${L('Số thẻ mới tối đa mỗi ngày','New cards per day')}<input class="field" id="onew" type="number" min="0" value="${c.newDay}"></label>
     ${H(L('Thẻ mới là thẻ anh chưa học lần nào. Để 9999 là không giới hạn.','Cards you have never studied. 9999 means no limit.'))}
     <label class="lab">${L('Số thẻ ôn tối đa mỗi ngày','Reviews per day')}<input class="field" id="orev" type="number" min="0" value="${c.revDay}"></label>
     ${H(L('Thẻ ôn là thẻ đã học, đến ngày cần nhắc lại. Để 9999 là không giới hạn.','Cards you already learned that are due again. 9999 means no limit.'))}</div>
   <div class="osec"><div class="ot">${L('Khi học thẻ mới','Learning new cards')}</div>
     <label class="lab">${L('Hỏi lại sau bao lâu trong lúc học','Learning steps')}<input class="field" id="olearn" value="${stepsTxt(c.learn)}"></label>
     ${H(L('Ví dụ "1m 10m": bấm Nhớ thì 1 phút sau hỏi lại, rồi 10 phút sau hỏi lần nữa. m = phút, h = giờ, d = ngày.','E.g. "1m 10m": asked again after 1 minute, then after 10 minutes. m = minutes, h = hours, d = days.'))}
     <label class="lab">${L('Thuộc rồi thì mấy ngày sau mới ôn','Graduating interval (days)')}<input class="field" id="ograd" type="number" min="1" value="${c.gradIvl}"></label>
     ${H(L('Sau khi qua hết các lần hỏi lại ở trên, thẻ sẽ quay lại sau từng này ngày.','After the steps above, the card comes back after this many days.'))}
     <label class="lab">${L('Thẻ mới lấy theo thứ tự nào','New card order')}${opt('onord',c.newOrder,[['added',L('Thẻ thêm trước học trước','Order added')],['random',L('Ngẫu nhiên','Random')]])}</label></div>
   <div class="osec"><div class="ot">${L('Khi quên thẻ đã thuộc','When you forget a card')}</div>
     <label class="lab">${L('Hỏi lại sau bao lâu','Relearning steps')}<input class="field" id="orelearn" value="${stepsTxt(c.relearn)}"></label>
     ${H(L('Ví dụ "10m": bấm Quên thì 10 phút sau thẻ hiện lại để học lại.','E.g. "10m": after Forgot, the card shows again 10 minutes later.'))}
     <label class="lab">${L('Ôn lại sớm nhất sau mấy ngày','Minimum interval (days)')}<input class="field" id="ominl" type="number" min="1" value="${c.minLapse}"></label>
     ${H(L('Học lại xong, thẻ quay lại không sớm hơn số ngày này.','After relearning, the card comes back no sooner than this.'))}
     <label class="lab">${L('Quên bao nhiêu lần thì coi là thẻ khó','Hard card after this many lapses')}<input class="field" id="oleech" type="number" min="1" value="${c.leechN}"></label>
     <label class="lab">${L('Gặp thẻ khó thì','Then')}${opt('oleechA',c.leechAct,[['tag',L('Chỉ đánh dấu "leech" để anh tìm lại','Only tag it "leech"')],['suspend',L('Ẩn thẻ đi, không hỏi nữa','Suspend it')]])}</label>
     ${H(L('Thẻ khó thường do nội dung thẻ chưa rõ. Vào Duyệt thẻ, gõ is:leech để xem và sửa.','Hard cards are often unclear cards. Search is:leech in Browse to fix them.'))}</div>
   <div class="osec"><div class="ot">${L('Thứ tự thẻ khi học','Order while studying')}</div>
     <label class="lab">${L('Thẻ mới và thẻ ôn','New and review cards')}${opt('omix',c.mix,[['mix',L('Xen kẽ nhau','Mixed')],['before',L('Thẻ mới trước, thẻ ôn sau','New first')],['after',L('Thẻ ôn trước, thẻ mới sau','Reviews first')]])}</label>
     <label class="lab">${L('Thẻ ôn hiện theo thứ tự','Review order')}${opt('orord',c.revOrder,[['due',L('Thẻ đến hạn trước hiện trước','By due date')],['random',L('Ngẫu nhiên','Random')],['retr',L('Thẻ sắp quên nhất hiện trước','Most likely forgotten first')]])}</label></div>
   <div class="osec"><div class="ot">${L('Thẻ cùng một từ','Cards from the same note')}</div>
     ${sw('obn',c.buryNew,L('Không hỏi 2 thẻ mới của cùng một từ trong một ngày','Hold back sibling new cards'),L('Ví dụ một từ có thẻ Nhật→Việt và Việt→Nhật thì thẻ còn lại để mai.','E.g. if a word has two cards, the other one waits until tomorrow.'))}
     ${sw('obr',c.buryRev,L('Áp dụng giống vậy cho thẻ ôn','Same for review cards'))}</div>
   <div class="osec"><div class="ot">${L('Đồng hồ','Timer')}</div>
     ${sw('otimer',c.showTimer,L('Hiện thời gian đang nghĩ trên mỗi thẻ','Show a timer on each card'))}
     <label class="lab">${L('Nghĩ lâu hơn số giây này thì chỉ tính bằng số này','Count at most this many seconds')}<input class="field" id="ocap" type="number" min="5" value="${c.capSec}"></label>
     ${H(L('Để thống kê thời gian học không bị đội lên khi anh bỏ đi giữa chừng.','Keeps study time stats sane if you walk away mid-card.'))}</div>
   <div class="osec"><div class="ot">${L('Tự lướt thẻ','Auto advance')}</div>
     ${H(L('Bấm ▶ Tự lướt trên thanh ngay dưới thẻ khi đang học. App tự lật thẻ và tự chuyển thẻ theo số giây dưới đây.','Turn on while studying from the ⋯ button.'))}
     <label class="lab">${L('Mặt trước hiện bao nhiêu giây rồi tự lật','Seconds before showing the answer')}<input class="field" id="oaq" type="number" min="1" value="${c.autoQ}"></label>
     <label class="lab">${L('Mặt sau hiện bao nhiêu giây','Seconds to show the answer')}<input class="field" id="oaa" type="number" min="1" value="${c.autoA}"></label>
     <label class="lab">${L('Hết giờ mặt sau mà anh chưa chấm thì','When time runs out')}${opt('oact',c.autoAct==='hard'||c.autoAct==='easy'?'good':c.autoAct,[['again',L('Tính là Quên','Count as Again')],['good',L('Tính là Nhớ','Count as Good')],['remind',L('Chỉ nhắc, chờ anh chấm','Just remind me')]])}</label></div>
   <div class="osec"><div class="ot">${L('Cách tính lịch ôn','Scheduling')}</div>
     <label class="lab">${L('Muốn nhớ được bao nhiêu phần trăm thẻ','Target memory rate')} <b id="oretv">${Math.round(c.ret*100)}%</b><input type="range" id="oret" min="70" max="99" value="${Math.round(c.ret*100)}"></label>
     ${H(L('Cao hơn thì ôn dày hơn, nhớ chắc hơn nhưng mỗi ngày nhiều thẻ hơn. 90% là mức Anki khuyên dùng.','Higher means more reviews per day but better memory. 90% is the usual choice.'))}
     <label class="lab">${L('Bộ số của thuật toán FSRS (không cần đụng)','FSRS parameters (optional)')}<input class="field" id="ow" value="${esc(c.w)}" placeholder="${L('Để trống là dùng mặc định','Blank = default')}"></label>
     ${H(L('Anki tính lịch ôn bằng thuật toán FSRS. Nếu anh đã có bộ số tối ưu trong Anki thì dán vào đây, không thì để trống.','Paste optimized parameters from Anki if you have them, otherwise leave blank.'))}
     <label class="lab">${L('Lâu nhất bao nhiêu ngày mới ôn một lần','Maximum interval (days)')}<input class="field" id="omax" type="number" min="1" value="${c.maxIvl}"></label>
     ${H(L('Dù thẻ dễ đến đâu cũng không để lâu hơn số ngày này.','Even easy cards come back within this many days.'))}</div>
   <div class="osec"><div class="ot">${L('Deck này','This deck')}</div>
     <label class="lab">${L('Tên deck','Deck name')}<input class="field" id="oname" value="${esc(name.split('::').pop())}"></label>
     <label class="lab">${L('Nằm trong deck','Inside deck')}${parentSelect('opar',st,name.includes('::')?name.slice(0,name.lastIndexOf('::')):'',name)}</label>
     <label class="lab">${L('Cách học deck này','How to study this deck')}${opt('omode',modeOf(name,st.decks),[['srs',L('Học đề xuất (app tính lịch ôn)','Scheduled (spaced repetition)')],['flip',L('Tự lướt thẻ (không tính lịch)','Flip through (no scheduling)')]])}</label>
     ${H(L('Tự lướt: mở ra là lướt hết thẻ theo thứ tự, không chấm Nhớ/Quên, không tính vào số thẻ cần học hôm nay. Lịch ôn cũ của thẻ vẫn giữ nguyên, đổi lại học đề xuất là tiếp tục như trước.','Flip: browse all cards in order without grading. Existing schedules are kept.'))}
     ${H(L('Chọn deck cha để gom deck này vào trong deck đó (như kéo thả trong Anki). Deck con của nó đi theo.','Pick a parent to nest this deck; its subdecks move along.'))}
     ${sw('osub',false,L('Cho các deck con dùng chung bộ cài đặt này','Apply preset to all subdecks'))}</div>
   <div class="row wrapbtn" style="margin:6px 0 4px"><button class="btn line sm" id="obrowse">${L('Xem thẻ','Browse')}</button><button class="btn line sm" id="oadd">${L('Thêm thẻ','Add')}</button><button class="btn line sm" id="ostat">${L('Thống kê','Stats')}</button><button class="btn line sm" id="oexp">${L('Xuất file','Export')}</button><button class="btn line sm" id="odel" style="color:var(--ng)">${L('Xóa deck','Delete')}</button></div>
   <div class="osave"><button class="btn bee" id="osave" style="width:100%">${L('Lưu','Save')}</button></div>
  </div>`;
    const q=s=>v.querySelector(s);
    q('#ox').onclick=close;
    q('#oret').oninput=e=>q('#oretv').textContent=e.target.value+'%';
    q('#opre').onchange=e=>{collect();pid=e.target.value;draw()};
    q('#opmenu').onclick=()=>{const a=q('#opacts');a.style.display=a.style.display==='none'?'flex':'none'};
    v.querySelectorAll('[data-pa]').forEach(b=>b.onclick=()=>{collect();const k=b.dataset.pa;
      if(k==='add'||k==='clone'){const nm=prompt(L('Tên bộ cài đặt mới:','New preset name:'));if(!nm)return;const id='p'+Date.now();P[id]=Object.assign({},k==='clone'?P[pid]:PDEF,{name:nm});pid=id}
      else if(k==='ren'){const nm=prompt(L('Tên mới:','New name:'),P[pid].name);if(nm)P[pid].name=nm}
      else if(k==='del'){if(pid==='1'){toast(L('Không xóa được bộ mặc định','The default preset cannot be deleted'));return}if(!confirm(L('Xóa bộ cài đặt này? Deck đang dùng sẽ về bộ mặc định.','Delete this preset? Decks using it go back to Default.')))return;delete P[pid];st.decks.forEach(x=>{if(String(x.cfgId)===pid){x.cfgId='1';ANKI.put('decks',x)}});pid='1'}
      savePresets(P);draw()});
    const collect=()=>{if(!q('#onew'))return;const c=P[pid]=Object.assign({},PDEF,P[pid]);
      c.newDay=Math.max(0,+q('#onew').value|0);c.revDay=Math.max(0,+q('#orev').value|0);c.learn=parseSteps(q('#olearn').value);c.relearn=parseSteps(q('#orelearn').value);
      c.gradIvl=Math.max(1,+q('#ograd').value|0);c.newOrder=q('#onord').value;c.minLapse=Math.max(1,+q('#ominl').value|0);c.leechN=Math.max(1,+q('#oleech').value|0);c.leechAct=q('#oleechA').value;
      c.mix=q('#omix').value;c.revOrder=q('#orord').value;c.buryNew=q('#obn').checked;c.buryRev=q('#obr').checked;c.showTimer=q('#otimer').checked;c.capSec=Math.max(5,+q('#ocap').value|0);c.autoQ=Math.max(1,+q('#oaq').value||6);c.autoA=Math.max(1,+q('#oaa').value||4);c.autoAct=q('#oact').value;
      c.ret=+q('#oret').value/100;c.w=q('#ow').value.trim();c.maxIvl=Math.max(1,+q('#omax').value|0)};
    q('#osave').onclick=async()=>{collect();savePresets(P);for(const k in FS)delete FS[k];
      const sh=q('#oname').value.trim().replace(/::+/g,' ')||name.split('::').pop();const par=q('#opar').value;const nn=(par?par+'::':'')+sh;
      if(nn!==name&&st.decks.some(x=>x.name===nn)){toast(L('Đã có deck tên này ở chỗ đó','A deck with that name is already there'));return}
      const targets=q('#osub').checked?st.decks.filter(x=>x.name===name||x.name.startsWith(name+'::')):[d];
      targets.forEach(x=>x.cfgId=pid);const md=q('#omode').value;if(modeOf(name,st.decks)!==md||d.mode)d.mode=md;if(!targets.includes(d))targets.push(d);await ANKI.putMany('decks',targets);
      if(nn&&nn!==name){const rows=st.decks.filter(x=>x.name===name||x.name.startsWith(name+'::'));rows.forEach(x=>x.name=nn+x.name.slice(name.length));await ANKI.putMany('decks',rows)}
      toast(L('Đã lưu','Saved'));close()};
    q('#obrowse').onclick=()=>{v.remove();TAB='browse';BR.q=`deck:"${name}"`;BR.sel=null;render()};
    q('#oadd').onclick=()=>{v.remove();addCards(d.id)};
    q('#ostat').onclick=()=>{v.remove();TAB='stats';STA.deck=name;render()};
    q('#oexp').onclick=()=>exportDeck(name,cards);
    q('#odel').onclick=async()=>{if(!confirm(L(`Xóa deck "${name}" và ${cards.length} thẻ trong đó? Không hoàn tác được.`,`Delete "${name}" and its ${cards.length} cards? This cannot be undone.`)))return;
      for(const id of set)await ANKI.delDeck(id);close()};
  };
  document.body.appendChild(v);v.onclick=e=>{if(e.target===v)close()};draw();
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
const emptyCard=()=>({due:new Date(),stability:0,difficulty:0,elapsed_days:0,scheduled_days:0,reps:0,lapses:0,state:0,learning_steps:0});
function makeCard(deck,front,back,tags){const id='n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  return {id,deck,guid:newGuid(),fl:[front,back],front,back:front+'<hr id=answer>'+back,tags:tags||'',appAt:0,created:Date.now(),card:emptyCard()}}
function parsePaste(txt){
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
   <div class="seg" style="margin-bottom:12px"><button data-am="paste" class="on">${L('Dán nhiều thẻ','Paste many')}</button><button data-am="one">${L('Từng thẻ','One card')}</button><button data-am="img">${L('Từ ảnh','From images')}</button></div>
   <label class="lab">Deck<select class="field" id="adeck">${decks.map(d=>`<option value="${esc(d.id)}" ${d.id===def?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
   <div id="apaste"><label class="lab">${L('Dán các dòng Mặt trước⇥Mặt sau (HTML được). Dòng #deck:Tên đổi deck.','Paste lines Front⇥Back (HTML ok). A #deck:Name line picks the deck.')}<textarea class="field mono" id="atxt" rows="8"></textarea></label>
     <label class="chk"><input type="checkbox" id="aover"> ${L('Thẻ trùng mặt trước: ghi đè mặt sau (giữ lịch ôn)','Duplicate front: overwrite back (keep schedule)')}</label>
     <div class="tiny" id="ainfo" style="margin-top:6px"></div></div>
   <div id="aone" style="display:none"><label class="lab">${L('Mặt trước','Front')}<textarea class="field" id="af" rows="2"></textarea></label><label class="lab">${L('Mặt sau','Back')}<textarea class="field" id="ab" rows="5"></textarea></label><label class="lab">Tags<input class="field" id="at"></label></div>
   <div id="aimg" style="display:none"><label class="lab">${L('Chọn một hoặc nhiều ảnh, mỗi ảnh thành một thẻ (ảnh ở mặt trước)','Pick one or more images, one card each')}<input class="field" id="afiles" type="file" accept="image/*" multiple></label>
     <label class="lab">${L('Ảnh đặt ở','Image goes on')}<select class="field" id="aipos"><option value="back">${L('Mặt sau, mặt trước là tên file ảnh (sửa được sau)','Back; front = file name')}</option><option value="front">${L('Mặt trước','Front')}</option></select></label>
     <label class="lab" id="aibl" style="display:none">${L('Mặt sau (không bắt buộc, giống nhau cho mọi ảnh)','Back (optional)')}<input class="field" id="aib"></label><div class="tiny" id="aiinfo"></div></div>
   <button class="btn bee" id="ago" style="width:100%;margin-top:14px">${L('Thêm','Add')}</button></div>`;
  document.body.appendChild(v);
  let mode='paste';
  const close=()=>{v.remove();dropState();render()};
  v.querySelector('#ax').onclick=close;
  v.querySelectorAll('[data-am]').forEach(b=>b.onclick=()=>{mode=b.dataset.am;v.querySelectorAll('[data-am]').forEach(x=>x.classList.toggle('on',x===b));v.querySelector('#apaste').style.display=mode==='paste'?'':'none';v.querySelector('#aone').style.display=mode==='one'?'':'none';v.querySelector('#aimg').style.display=mode==='img'?'':'none'});
  v.querySelector('#aipos').onchange=e=>{v.querySelector('#aibl').style.display=e.target.value==='front'?'':'none'};
  v.querySelector('#afiles').onchange=e=>{v.querySelector('#aiinfo').textContent=L(`${e.target.files.length} ảnh → ${e.target.files.length} thẻ`,`${e.target.files.length} images`)};
  // chèn ảnh vào thẻ đơn
  [['af',L('Chèn ảnh vào mặt trước','Image on front')],['ab',L('Chèn ảnh vào mặt sau','Image on back')]].forEach(([id,lab])=>{const t=v.querySelector('#'+id);const b=document.createElement('button');b.className='btn line sm';b.style.marginTop='6px';b.textContent='🖼 '+lab;
    b.onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const n=await imgToCard(i.files[0]);t.value+=(t.value?'<br>':'')+`<img src="${n}">`};i.click()};t.parentNode.after(b)});
  const info=()=>{const r=parsePaste(v.querySelector('#atxt').value);const ok=r.rows.filter(x=>!x.err).length,bad=r.rows.length-ok;
    v.querySelector('#ainfo').textContent=ok||bad?L(`${ok} thẻ hợp lệ${bad?`, ${bad} dòng thiếu dấu tab`:''}${r.deckName?` · vào deck ${r.deckName}`:''}`,`${ok} cards${bad?`, ${bad} lines without a tab`:''}${r.deckName?` · into ${r.deckName}`:''}`):''};
  v.querySelector('#atxt').oninput=info;
  v.querySelector('#ago').onclick=async()=>{
    let deck=v.querySelector('#adeck').value;S.lastDeck=deck;save();
    const all=(await ankiState(true)).cards;
    if(mode==='img'){const fs=[...v.querySelector('#afiles').files];if(!fs.length)return;const bk=v.querySelector('#aib').value.trim();const add=[];
      for(let k=0;k<fs.length;k++){v.querySelector('#aiinfo').textContent=L(`Đang xử lý ảnh ${k+1}/${fs.length}…`,`Processing ${k+1}/${fs.length}…`);try{const n=await imgToCard(fs[k]);const im=`<img src="${n}">`;const c=v.querySelector('#aipos').value==='front'?makeCard(deck,im,bk,''):makeCard(deck,esc(fs[k].name.replace(/\.[^.]+$/,'')),im,'');c.created+=k;add.push(c)}catch(e){console.warn(e)}}
      if(add.length)await ANKI.putMany('cards',add);toast(L(`Đã thêm ${add.length} thẻ ảnh`,`Added ${add.length} image cards`));close();return}
    if(mode==='one'){const f=v.querySelector('#af').value.trim(),b=v.querySelector('#ab').value.trim();if(!f)return;
      await ANKI.put('cards',makeCard(deck,f,b,v.querySelector('#at').value.trim()));toast(L('Đã thêm 1 thẻ','Added 1 card'));v.querySelector('#af').value='';v.querySelector('#ab').value='';v.querySelector('#af').focus();dropState();return}
    const r=parsePaste(v.querySelector('#atxt').value);
    if(r.deckName){let d=(await ANKI.all('decks')).find(x=>x.name===r.deckName);if(!d){d={id:'d'+Date.now(),name:r.deckName,at:Date.now(),cfgId:'1'};await ANKI.put('decks',d)}deck=d.id}
    const byFront={};all.filter(c=>c.deck===deck).forEach(c=>byFront[stripHtml(fieldsOf(c)[0]).trim()]=c);
    const over=v.querySelector('#aover').checked;const add=[],upd=[];let dup=0;const seen=new Set();
    r.rows.filter(x=>!x.err).forEach(x=>{const k=stripHtml(x.front).trim();if(seen.has(k))return;seen.add(k);const ex=byFront[k];
      if(ex){if(over){ex.fl=[x.front,x.back];ex.front=x.front;ex.back=x.front+'<hr id=answer>'+x.back;ex.edited=1;upd.push(ex)}else dup++}else add.push(makeCard(deck,x.front,x.back))});
    if(add.length)await ANKI.putMany('cards',add);if(upd.length)await ANKI.putMany('cards',upd);
    toast(L(`Đã thêm ${add.length} thẻ${upd.length?`, cập nhật ${upd.length}`:''}${dup?`, bỏ qua ${dup} thẻ trùng`:''}`,`Added ${add.length}${upd.length?`, updated ${upd.length}`:''}${dup?`, skipped ${dup} duplicates`:''}`));
    close()};
}

/* ---------- duyệt thẻ ---------- */
const BR={q:'',sel:null,lim:200,sort:'created',desc:true,pick:null};
function matchCard(c,q,deckName){
  const toks=q.match(/(-?\w+:"[^"]*"|-?\w+:\S+|"[^"]*"|\S+)/g)||[];
  const txt=(stripHtml(c.front)+' '+stripHtml(c.back)+' '+(c.tags||'')).toLowerCase();
  return toks.every(t=>{let neg=false;if(t[0]==='-'){neg=true;t=t.slice(1)}let ok;
    const m=t.match(/^(\w+):"?([^"]*)"?$/);
    if(m&&['deck','is','tag','prop','added','rated'].includes(m[1])){const k=m[1],val=m[2].toLowerCase();
      if(k==='deck'){const dn=(deckName[c.deck]||'').toLowerCase();ok=dn===val||dn.startsWith(val+'::')||(val.endsWith('*')&&dn.startsWith(val.slice(0,-1)))}
      else if(k==='tag')ok=(c.tags||'').toLowerCase().split(/\s+/).some(x=>x===val||(val.endsWith('*')&&x.startsWith(val.slice(0,-1))));
      else if(k==='added'){const n=+val||1;ok=createdAt(c)>=dayEnd()-n*864e5}
      else if(k==='rated'){const n=+val||1;ok=!!c.card.last_review&&new Date(c.card.last_review).getTime()>=dayEnd()-n*864e5}
      else if(k==='prop'){const pm=val.match(/^(ivl|lapses|reps|due)(<=|>=|<|>|=)(-?\d+)$/);if(!pm)ok=true;else{const x=pm[1]==='ivl'?c.card.scheduled_days:pm[1]==='lapses'?c.card.lapses:pm[1]==='reps'?c.card.reps:Math.round((new Date(c.card.due)-dayEnd())/864e5)+1;const y=+pm[3];ok={'<':x<y,'>':x>y,'<=':x<=y,'>=':x>=y,'=':x===y}[pm[2]]}}
      else ok=val==='new'?c.card.state===0:val==='due'?isDue(c,Date.now(),dayEnd()):val==='suspended'?!!c.susp:val==='learn'?(c.card.state===1||c.card.state===3):val==='review'?c.card.state===2:val==='leech'?/\bleech\b/i.test(c.tags||''):val==='buried'?c.buried===dayKey():true}
    else ok=txt.includes(t.replace(/"/g,'').toLowerCase());
    return neg?!ok:ok});
}
function createdAt(c){if(c.created)return c.created;const n=parseInt(String(c.id).slice(1),10);return n>1e12?n:0}
const SORTS={created:c=>createdAt(c),due:c=>c.card.state===0?9e15:new Date(c.card.due).getTime(),ivl:c=>c.card.scheduled_days||0,lapses:c=>c.card.lapses||0,reps:c=>c.card.reps||0,diff:c=>c.card.difficulty||0,front:c=>stripHtml(fieldsOf(c)[0])};
async function browse(){
  const pick=BR.pick;
  shell(`${header()}<div class="browse"><div class="blist card">
    <input class="field" id="bq" placeholder="${esc(L('Tìm: chữ, deck:"Tên", is:new, is:due, is:suspended, is:leech, tag:x, added:7, rated:1, prop:ivl>30','Search: text, deck:"Name", is:new, is:due, is:suspended, is:leech, tag:x, added:7, rated:1, prop:ivl>30'))}" value="${esc(BR.q)}">
    <div class="row bbar"><select class="field sm" id="bsort">${[['created',L('Ngày thêm','Added')],['due',L('Ngày đến hạn','Due')],['ivl',L('Khoảng cách','Interval')],['lapses',L('Số lần quên','Lapses')],['reps',L('Số lần ôn','Reviews')],['diff',L('Độ khó','Difficulty')],['front',L('Mặt trước','Sort field')]].map(([k,l])=>`<option value="${k}" ${BR.sort===k?'selected':''}>${l}</option>`).join('')}</select>
      <button class="iconbtn sm" id="bdir" aria-label="${L('Đảo thứ tự','Reverse')}">${BR.desc?'↓':'↑'}</button><span class="grow"></span>
      <button class="btn line sm" id="bpick">${pick?L('Xong','Done'):L('Chọn nhiều','Select')}</button><button class="btn line sm" id="badd">${L('+ Thêm','+ Add')}</button></div>
    <div class="tiny" id="bcount"></div>
    ${pick?`<div class="bulk"><button class="btn line sm" id="ball">${L('Chọn tất cả','Select all')}</button><span class="tiny" id="bpn">0</span><span class="grow"></span>
      <select class="field sm" id="bact"><option value="">${L('Làm gì với thẻ đã chọn…','Action for selected…')}</option><option value="deck">${L('Đổi deck','Change deck')}</option><option value="susp">${L('Tạm ẩn','Suspend')}</option><option value="unsusp">${L('Bỏ tạm ẩn','Unsuspend')}</option><option value="tag">${L('Thêm tag','Add tag')}</option><option value="untag">${L('Bỏ tag','Remove tag')}</option><option value="due">${L('Đặt ngày đến hạn','Set due date')}</option><option value="forget">${L('Học lại từ đầu','Reset to new')}</option><option value="del">${L('Xóa','Delete')}</option></select></div>`:''}
    <div id="brows"></div></div><div class="bedit card" id="bedit"><div class="tiny">${L('Chọn một thẻ để xem và sửa.','Pick a card to view and edit.')}</div></div></div>`);
  const st=await ankiState();const deckName={};st.decks.forEach(d=>deckName[d.id]=d.name);
  let list=[];
  const draw=()=>{const bq=$('#bq');if(bq)BR.q=bq.value;const q=BR.q.trim();list=q?st.cards.filter(c=>matchCard(c,q,deckName)):st.cards.slice();
    const f=SORTS[BR.sort]||SORTS.created;list.sort((a,b)=>{const x=f(a),y=f(b);const r=typeof x==='string'?x.localeCompare(y):x-y;return BR.desc?-r:r});
    const el=$('#brows');if(!el)return;
    $('#bcount').textContent=L(`${list.length} thẻ`,`${list.length} cards`)+(list.length>BR.lim?L(` · hiện ${BR.lim} thẻ đầu`,` · showing first ${BR.lim}`):'');
    el.innerHTML=(list.length?'':`<div class="empty">${dog('','','search')}${L('Không tìm thấy thẻ nào.','No cards found.')}</div>`)+list.slice(0,BR.lim).map(c=>{const [f,b]=fieldsOf(c);const due=c.card.state===0?L('mới','new'):new Date(c.card.due).toLocaleDateString(L('vi-VN','en-GB'));
      return `<div class="brow ${BR.sel===c.id?'on':''} ${c.susp?'susp':''}" data-id="${esc(c.id)}">${pick?`<input type="checkbox" class="bpk" ${pick.has(c.id)?'checked':''}>`:''}<div class="bt"><span class="bf jp">${esc(stripHtml(f).slice(0,70))}</span><span class="bb">${esc(stripHtml(b).slice(0,90))}</span><span class="tiny">${esc(deckName[c.deck]||'')} · ${due}${c.susp?' · '+L('tạm ẩn','suspended'):''}</span></div></div>`}).join('')+(list.length>BR.lim?`<button class="btn line" id="bmore" style="width:100%;margin-top:8px">${L('Hiện thêm','Show more')}</button>`:'');
    $$('.brow').forEach(b=>b.onclick=e=>{const id=b.dataset.id;
      if(pick){if(pick.has(id))pick.delete(id);else pick.add(id);const cb=b.querySelector('.bpk');cb.checked=pick.has(id);$('#bpn').textContent=L(`${pick.size} đã chọn`,`${pick.size} selected`);return}
      BR.sel=id;$$('.brow').forEach(x=>x.classList.toggle('on',x===b));editCard(st.cards.find(c=>c.id===id),st,()=>{dropState();browse()})});
    const pn=$('#bpn');if(pn)pn.textContent=L(`${pick.size} đã chọn`,`${pick.size} selected`);
    const mo=$('#bmore');if(mo)mo.onclick=()=>{BR.lim+=300;draw()}};
  let t=null;$('#bq').oninput=()=>{BR.lim=200;clearTimeout(t);t=setTimeout(draw,180)};
  $('#bsort').onchange=e=>{BR.sort=e.target.value;draw()};
  $('#bdir').onclick=e=>{BR.desc=!BR.desc;e.currentTarget.textContent=BR.desc?'↓':'↑';draw()};
  $('#badd').onclick=()=>addCards();
  $('#bpick').onclick=()=>{BR.pick=BR.pick?null:new Set();browse()};
  if(pick){$('#ball').onclick=()=>{list.forEach(c=>pick.add(c.id));draw()};
    $('#bact').onchange=async e=>{const act=e.target.value;e.target.value='';if(!act||!pick.size)return;
      const sel=st.cards.filter(c=>pick.has(c.id));let ch=null;
      if(act==='deck'){const names=st.decks.map(d=>d.name).sort();const nm=prompt(L('Gõ tên deck đích:','Target deck name:')+'\n'+names.join('\n'));const d=st.decks.find(x=>x.name===nm);if(!d)return;ch=c=>{c.deck=d.id}}
      else if(act==='susp')ch=c=>{c.susp=1};else if(act==='unsusp')ch=c=>{c.susp=0};
      else if(act==='tag'||act==='untag'){const tg=(prompt(L('Tag:','Tag:'))||'').trim();if(!tg)return;ch=c=>{const s=new Set((c.tags||'').split(/\s+/).filter(Boolean));act==='tag'?s.add(tg):s.delete(tg);c.tags=[...s].join(' ')}}
      else if(act==='due'){const n=prompt(L('Đến hạn sau bao nhiêu ngày? (0 = hôm nay, có thể ghi 3-7)','Due in how many days? (0 = today, ranges like 3-7)'),'0');if(n==null)return;const m=String(n).match(/^(\d+)(?:-(\d+))?$/);if(!m)return;const a=+m[1],b=m[2]?+m[2]:a;
        ch=c=>{const dd=a+Math.floor(Math.random()*(b-a+1));if(c.card.state===0){c.card.stability=c.card.stability||1;c.card.difficulty=c.card.difficulty||5;c.card.last_review=new Date()}c.card.state=2;c.card.scheduled_days=Math.max(dd,1);c.card.due=new Date(dayEnd()-864e5+dd*864e5+3600e3);c.appAt=Date.now()}}
      else if(act==='forget'){if(!confirm(L(`Đưa ${sel.length} thẻ về thẻ mới?`,`Reset ${sel.length} cards?`)))return;ch=c=>{c.card=emptyCard();c.appAt=Date.now()}}
      else if(act==='del'){if(!confirm(L(`Xóa ${sel.length} thẻ? Không hoàn tác được.`,`Delete ${sel.length} cards? This cannot be undone.`)))return;for(const c of sel)await ANKI.del('cards',c.id);pick.clear();toast(L('Đã xóa','Deleted'));dropState();return browse()}
      sel.forEach(c=>{ch(c);c.edited=c.edited||0});await ANKI.putMany('cards',sel);toast(L(`Đã cập nhật ${sel.length} thẻ`,`Updated ${sel.length} cards`));dropState();browse()}}
  draw();
  if(BR.sel&&!pick){const c=st.cards.find(x=>x.id===BR.sel);if(c)editCard(c,st,()=>{dropState();browse()},true)}
}
async function editCard(c,st,done,quiet){
  const box=$('#bedit');if(!box||!c)return;
  const [f,b]=fieldsOf(c);const decks=st.decks.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const rev=await ANKI.getRev(c.id);const logs=rev?rev.logs:[];
  const k=c.card;const stName=[L('Mới','New'),L('Đang học','Learning'),L('Ôn','Review'),L('Học lại','Relearning')][k.state]||'';
  const ca=createdAt(c);
  box.innerHTML=`<div class="row bedhead"><button class="iconbtn sm mob" id="eclose" aria-label="${L('Quay lại','Back')}">${I.back}</button><div class="grow" style="font-weight:800">${L('Sửa thẻ','Edit card')}</div></div>
   <label class="lab">Deck<select class="field" id="edeck">${decks.map(d=>`<option value="${esc(d.id)}" ${d.id===c.deck?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
   <label class="lab">${L('Mặt trước (HTML)','Front (HTML)')}<textarea class="field mono" id="ef" rows="3">${esc(f)}</textarea></label>
   <label class="lab">${L('Mặt sau (HTML)','Back (HTML)')}<textarea class="field mono" id="eb" rows="7">${esc(b)}</textarea></label>
   <label class="lab">Tags<input class="field" id="etag" value="${esc(c.tags||'')}"></label>
   <div class="row wrapbtn" style="margin-top:12px"><button class="btn bee" id="esave">${L('Lưu','Save')}</button><button class="btn line" id="esusp">${c.susp?L('Bỏ tạm ẩn','Unsuspend'):L('Tạm ẩn','Suspend')}</button><button class="btn line" id="eforget">${L('Học lại từ đầu','Reset')}</button><button class="btn line" id="edel" style="color:var(--ng)">${L('Xóa','Delete')}</button></div>
   <div class="h">${L('Xem trước','Preview')}</div><div class="preview jp" id="eprev">${backHTML(c)}</div>
   <div class="h">${L('Thông tin thẻ','Card info')}</div>
   <div class="cinfo">
    <span>${L('Trạng thái','State')}</span><b>${stName}${c.susp?' · '+L('tạm ẩn','suspended'):''}</b>
    <span>${L('Ngày thêm','Added')}</span><b>${ca?new Date(ca).toLocaleDateString(L('vi-VN','en-GB')):'—'}</b>
    <span>${L('Đến hạn','Due')}</span><b>${k.state===0?'—':new Date(k.due).toLocaleString(L('vi-VN','en-GB'))}</b>
    <span>${L('Khoảng cách','Interval')}</span><b>${k.scheduled_days||0} ${L('ngày','days')}</b>
    <span>${L('Độ ổn định','Stability')}</span><b>${(+k.stability||0).toFixed(1)} ${L('ngày','days')}</b>
    <span>${L('Độ khó','Difficulty')}</span><b>${k.difficulty?Math.round((k.difficulty-1)/9*100)+'%':'—'}</b>
    <span>${L('Khả năng nhớ','Retrievability')}</span><b>${k.state===0?'—':Math.round(retr(c,Date.now())*100)+'%'}</b>
    <span>${L('Số lần ôn','Reviews')}</span><b>${logs.length||k.reps||0}</b>
    <span>${L('Số lần quên','Lapses')}</span><b>${k.lapses||0}</b>
    <span>${L('Tổng thời gian','Total time')}</span><b>${Math.round(logs.reduce((a,l)=>a+(l[4]||0),0)/1000)} ${L('giây','s')}</b></div>
   ${logs.length?`<div class="revlog"><div class="rh"><span>${L('Ngày','Date')}</span><span>${L('Loại','Type')}</span><span>${L('Chấm','Rating')}</span><span>${L('Khoảng','Ivl')}</span></div>${logs.slice().reverse().map(l=>`<div><span>${new Date(l[0]).toLocaleString(L('vi-VN','en-GB'),{dateStyle:'short',timeStyle:'short'})}</span><span>${[L('Học','Learn'),L('Ôn','Review'),L('Học lại','Relearn'),L('Lọc','Filtered'),L('Sửa tay','Manual')][l[3]]||''}</span><b class="${l[1]===1?'ng':'okc'}">${l[1]===1?L('Quên','Again'):l[1]===2?L('Khó','Hard'):l[1]===3?L('Nhớ','Good'):L('Dễ','Easy')}</b><span>${fmtIvl(l[2])}</span></div>`).join('')}</div>`:''}`;
  ANKI.hydrate($('#eprev'));
  document.body.classList.add('editing');
  if(!quiet)window.scrollTo(0,0);
  $('#eclose').onclick=()=>{document.body.classList.remove('editing');BR.sel=null;$$('.brow.on').forEach(x=>x.classList.remove('on'))};
  const upd=async(ch)=>{Object.assign(c,ch);c.edited=1;await ANKI.put('cards',c);toast(L('Đã lưu','Saved'));done()};
  $('#esave').onclick=()=>{const nf=$('#ef').value,nb=$('#eb').value;
    upd({deck:$('#edeck').value,tags:$('#etag').value.trim(),fl:isSimple(c)?[nf,nb].concat(c.fl.slice(2)):c.fl,front:nf,back:nf+'<hr id=answer>'+nb})};
  $('#esusp').onclick=()=>upd({susp:c.susp?0:1});
  $('#eforget').onclick=()=>{if(confirm(L('Đưa thẻ này về thẻ mới?','Reset this card to new?')))upd({card:emptyCard(),appAt:Date.now()})};
  $('#edel').onclick=async()=>{if(!confirm(L('Xóa thẻ này?','Delete this card?')))return;await ANKI.del('cards',c.id);BR.sel=null;document.body.classList.remove('editing');toast(L('Đã xóa','Deleted'));done()};
}
function glow(stage,ok){if(!stage)return;const d=document.createElement('div');d.className='glow '+(ok?'ok':'ng');stage.appendChild(d);setTimeout(()=>d.remove(),700)}
// chó ong thỉnh thoảng bay ngang màn hình (không bay khi đang học hay làm đề)
const FLYBY=(()=>{let t=null;
  function go(){if(!document.hidden&&!AK&&!SS&&DATA&&!document.querySelector('.veil')&&!document.getElementById('intro')){
      const d=document.createElement('div');d.className='flyby'+(Math.random()<.5?' rtl':'');d.style.setProperty('--y',(12+Math.random()*55)+'vh');d.innerHTML=dog('fb');document.body.appendChild(d);setTimeout(()=>SFX.play('buzz'),1800);setTimeout(()=>d.remove(),9000)}
    t=setTimeout(go,(70+Math.random()*110)*1000)}
  return {start(){if(!t)t=setTimeout(go,25000)}}})();
// sửa thẻ ngay trong lúc học, xong quay lại đúng thẻ đó
function quickEdit(it){
  const [f,b]=fieldsOf(it);const v=document.createElement('div');v.className='veil';
  v.innerHTML=`<div class="panel"><div class="row" style="margin-bottom:8px"><div class="grow" style="font-weight:800;font-size:18px">${L('Sửa thẻ','Edit card')}</div><button class="iconbtn" id="qx" aria-label="Close">${I.x}</button></div>
   <label class="lab">${L('Mặt trước','Front')}<textarea class="field mono" id="qf" rows="2">${esc(f)}</textarea></label>
   <label class="lab">${L('Mặt sau','Back')}<textarea class="field mono" id="qb" rows="8">${esc(b)}</textarea></label>
   <label class="lab">Tags<input class="field" id="qt" value="${esc(it.tags||'')}"></label>
   <div class="row wrapbtn" style="margin-top:14px"><button class="btn bee grow" id="qs">${L('Lưu và học tiếp','Save and continue')}</button><button class="btn line" id="qsu">${it.susp?L('Bỏ ẩn','Unsuspend'):L('Ẩn thẻ này','Suspend')}</button></div>
   <div class="ohint">${L('Mặt sau viết HTML như trong Anki: &lt;br&gt; để xuống dòng.','Back uses HTML like Anki: &lt;br&gt; for a new line.')}</div></div>`;
  const close=()=>{v.remove()};
  v.onclick=e=>{if(e.target===v)close()};v.querySelector('#qx').onclick=close;
  v.querySelector('#qs').onclick=async()=>{const nf=v.querySelector('#qf').value,nb=v.querySelector('#qb').value;
    Object.assign(it,{tags:v.querySelector('#qt').value.trim(),fl:isSimple(it)?[nf,nb].concat(it.fl.slice(2)):it.fl,front:nf,back:nf+'<hr id=answer>'+nb,edited:1});
    try{await ANKI.put('cards',it);toast(L('Đã lưu','Saved'))}catch(e){toast(L('Không lưu được','Could not save'))}
    close();const show=AK&&AK.show;renderAnki();if(show){const fc=$('#fc');if(fc){AK.show=true;fc.classList.add('flip');$('#stage')&&$('#stage').classList.add('shown')}}};
  v.querySelector('#qsu').onclick=async()=>{it.susp=it.susp?0:1;await ANKI.put('cards',it).catch(()=>{});close();if(it.susp){toast(L('Đã ẩn thẻ','Card suspended'));AK.list.splice(AK.i,1);AK.show=false}renderAnki()};
  document.body.appendChild(v);
}
function fmtIvl(d){if(d==null)return '';if(d<0){const s=-d;return s<3600?Math.round(s/60)+L(' phút','m'):Math.round(s/3600)+L(' giờ','h')}if(d===0)return '';return d<30?d+L(' ngày','d'):d<365?(d/30).toFixed(1)+L(' tháng','mo'):(d/365).toFixed(1)+L(' năm','y')}

/* ---------- học ---------- */
function startAnki(deckSet,name){
  ankiState().then(st=>{
    const q=ankiQueue(st.cards,deckSet,st.decks,name);
    let list;const R=q.rev.slice(),N=q.fresh.slice();
    if(q.mix==='before')list=N.concat(R);else if(q.mix==='after')list=R.concat(N);
    else{list=[];while(R.length||N.length){const k=Math.max(1,Math.round(R.length/Math.max(1,N.length)));for(let i=0;i<k&&R.length;i++)list.push(R.shift());if(N.length)list.push(N.shift())}}
    list=q.learn.concat(list);
    if(!list.length){toast(L('Deck này hết thẻ để học hôm nay','Nothing left in this deck today'));return}
    AK={list,i:0,show:false,a:0,g:0,hist:[],title:name?name.split('::').pop():'',decks:st.decks,t0:Date.now()};render();
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
function fsFor(P){const k=P.ret+'|'+P.maxIvl+'|'+P.w;
  if(!FS[k]){const o={request_retention:P.ret,maximum_interval:P.maxIvl,enable_fuzz:true,enable_short_term:false};const w=String(P.w||'').split(/[\s,]+/).map(Number).filter(x=>!isNaN(x)&&String(x)!=='');if(w.length>=17)o.w=w;FS[k]=FSRS.fsrs(FSRS.generatorParameters(o))}return FS[k]}
// lịch như Anki: các bước học/học lại theo phút, còn lại để FSRS tính
function schedule(card,g,P){
  const now=new Date();const prev=card.state;const step=card.lstep||0;
  const nx=fsFor(P).repeat(reviveA(card),now)[g].card;
  const out=Object.assign({},nx);const min=m=>new Date(now.getTime()+m*60000);
  const day=(d)=>{out.state=2;out.scheduled_days=d;out.due=new Date(now.getTime()+d*864e5);out.lstep=0};
  if(prev===0||prev===1){const S_=P.learn;
    if(g===1){if(S_.length){out.state=1;out.lstep=0;out.due=min(S_[0]);out.scheduled_days=0}else day(Math.max(1,nx.scheduled_days))}
    else{const ns=prev===0?Math.min(1,S_.length):step+1;if(ns<S_.length){out.state=1;out.lstep=ns;out.due=min(S_[ns]);out.scheduled_days=0}else day(Math.max(P.gradIvl,nx.scheduled_days))}}
  else if(prev===2){if(g===1){if(P.relearn.length){out.state=3;out.lstep=0;out.due=min(P.relearn[0]);out.scheduled_days=0}else day(Math.max(P.minLapse,nx.scheduled_days))}}
  else{ // học lại
    if(g===1){out.state=3;out.lstep=0;out.due=min(P.relearn[0]||10);out.scheduled_days=0}
    else{const ns=step+1;if(ns<P.relearn.length){out.state=3;out.lstep=ns;out.due=min(P.relearn[ns])}else day(Math.max(P.minLapse,Math.min(nx.scheduled_days,Math.max(P.minLapse,Math.round(nx.stability||1)))))}}
  return out;
}
const revType=s=>s===2?1:s===3?2:0;
function renderAnki(){
  const it=AK.list[AK.i];
  if(!it){dropState();SFX.play('done');const D=daily();shell(`<div class="card center done" style="margin-top:40px">${dog('big','','done')}<div style="font-size:22px;font-weight:800">${L('Xong rồi!','All done!')}</div><p class="muted">${L(`Xong ${AK.a+AK.g} lượt: ${AK.g} nhớ, ${AK.a} quên.`,`${AK.a+AK.g} reviews: ${AK.g} remembered, ${AK.a} forgot.`)}<br>${L(`Hôm nay: ${D.n} thẻ, ${Math.round(D.ms/60000)} phút.`,`Today: ${D.n} cards, ${Math.round(D.ms/60000)} min.`)}</p><button class="btn bee" id="akb">${L('Về','Back')}</button></div>`,{tabs:false});$('#akb').onclick=()=>{AK=null;TAB='home';render()};return}
  const deck=AK.decks.find(d=>d.id===it.deck);const P=presetOf(deck);
  const left=AK.list.length-AK.i;
  const cnt={n:0,l:0,r:0};AK.list.slice(AK.i).forEach(c=>{const s=c.card.state;if(s===0)cnt.n++;else if(s===2)cnt.r++;else cnt.l++});
  const done=AK.a+AK.g,tot=done+left;
  full(`<div class="sbar"><button class="iconbtn" id="akq" aria-label="${L('Dừng','Stop')}">${I.x}</button>
     <div class="ttl">${AK.title?`<small>${esc(AK.title)}</small>`:''}<span class="qc"><b class="cn ${it.card.state===0?'cur':''}">${cnt.n}</b><b class="cl ${it.card.state===1||it.card.state===3?'cur':''}">${cnt.l}</b><b class="cr ${it.card.state===2?'cur':''}">${cnt.r}</b>${P.showTimer?`<span id="aktm">0:00</span>`:''}</span></div>
     ${sizeBtnHTML()}<button class="iconbtn" id="akundo" aria-label="${L('Hoàn tác','Undo')}" ${AK.hist.length?'':'disabled'}>${I.undo}</button>
     <button class="iconbtn ${AK.auto?'on':''}" id="akmenu" aria-label="${L('Tùy chọn','More')}">${I.dots}</button>
     <div class="akpop" id="akpop">
       <button id="akauto" class="${S.autoBar!==0?'on':''}">${I.play}<span>${L('Thanh tự lướt','Auto advance bar')}<small>${S.autoBar!==0?L('Đang hiện, bấm để ẩn','Shown, tap to hide'):L('Đang ẩn, bấm để hiện','Hidden, tap to show')}</small></span></button>
       <div class="row"><button id="aksm">A−</button><button id="aksp">A+</button></div>
       <button id="akmu" class="${MUSIC.on?'on':''}">${I.note}<span>${L('Nhạc nền','Music')}</span></button>
       <button id="akedit">${I.pen}<span>${L('Sửa thẻ này','Edit this card')}</span></button>
     </div></div>
   <div class="prog"><i style="width:${tot?Math.round(done/tot*100):0}%"></i><span class="akleft"><b class="cn">${cnt.n}</b> ${L('mới','new')}<b class="cl">${cnt.l}</b> ${L('đang học','learning')}<b class="cr">${cnt.r}</b> ${L('ôn','review')}</span><span><b class="a">${AK.a}</b> · <b class="g">${AK.g}</b></span></div>
   ${autoBarHTML(AK.auto,P.autoQ,P.autoA,P.autoAct,{grade:true})}
   <div class="deckwrap" id="akwrap"><div class="stage" id="stage">${dog('buddy'+(AK.dogAct&&Date.now()-AK.dogAct[1]<500?' '+AK.dogAct[0]:''),'akdog')}<div class="fc" id="fc"><div class="face front"><div class="fin">${it.front}</div></div><div class="face back"><div class="fin">${backHTML(it)}</div></div></div><svg class="aring" id="aring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg></div>
     <div class="gradebar"><button class="gb ng" id="gq">← ${L('Quên','Forgot')}</button><div class="tiny" id="akhint">${L('Chạm thẻ để lật','Tap the card to flip')}<span class="desk"> · ${L('phím cách','space')}</span></div><button class="gb ok" id="gn">${L('Nhớ','Remembered')} →</button></div></div>`);
  ANKI.hydrate($('#fc'));
  {const d=$('#akdog'),A=AK.dogAct;if(d&&A&&Date.now()-A[1]<500){const e=(Date.now()-A[1])/1000;d.querySelector('.sf').style.animationDelay=-e+'s';d._s=setTimeout(()=>{d.classList.remove('yay','sad');d.querySelector('.sf').style.animationDelay=''},(A[0]==='yay'?900:1300)-e*1000)}}
  const shown0=Date.now();clearInterval(AK.tmr);if(P.showTimer)AK.tmr=setInterval(()=>{const e=$('#aktm');if(!e)return clearInterval(AK.tmr);e.textContent=fmtTime(Math.min(P.capSec,(Date.now()-shown0)/1000))},1000);
  $('#akq').onclick=()=>{clearInterval(AK.tmr);clearTimeout(AK.at);AK=null;dropState();TAB='home';render()};
  $('#akundo').onclick=()=>{SFX.play('undo');undoAnki()};bindSizeBtn();
  $('#aksm').onclick=e=>{e.stopPropagation();S.size=Math.max(0,S.size-1);save();applyLook()};
  $('#aksp').onclick=e=>{e.stopPropagation();S.size=Math.min(SIZES.length-1,S.size+1);save();applyLook()};
  $('#akmu').onclick=e=>{MUSIC.toggle();e.currentTarget.classList.toggle('on',MUSIC.on)};
  $('#akedit').onclick=e=>{e.stopPropagation();$('#akpop').classList.remove('open');quickEdit(it)};
  $('#akmenu').onclick=e=>{e.stopPropagation();$('#akpop').classList.toggle('open')};
  $('#akpop').onclick=e=>e.stopPropagation();
  document.body.onclick=()=>{const p=$('#akpop');if(p)p.classList.remove('open')};
  $('#akauto').onclick=()=>{S.autoBar=S.autoBar===0?1:0;save();$('#akpop').classList.remove('open');const b=$('#abar');if(b)b.hidden=S.autoBar===0;const e=$('#akauto');e.classList.toggle('on',S.autoBar!==0);e.querySelector('small').textContent=S.autoBar!==0?L('Đang hiện, bấm để ẩn','Shown, tap to hide'):L('Đang ẩn, bấm để hiện','Hidden, tap to show')};
  const fc=$('#fc'),stage=$('#stage');
  let busy=false;
  const ring=(sec)=>{const r=$('#aring');if(!r)return;r.classList.remove('run');void r.getBBox();r.style.setProperty('--t',sec+'s');r.classList.add('run')};
  const flip=()=>{AK.show=true;SFX.play('flip');dogDo($('#akdog'),'buzz');fc.classList.add('flip');stage.classList.add('shown');$('#akwrap').classList.add('shown');
    armA()};
  const armA=()=>{clearTimeout(AK.at);if(!AK.auto)return;ring(P.autoA);AK.at=setTimeout(()=>{if(!AK||AK.list[AK.i]!==it)return;if(P.autoAct==='remind'){SFX.play('tap');dogSay($('#akdog'),L('Anh ơi, chấm thẻ này nè','Time to grade this one'),2500)}else grade(GRADE_OF[P.autoAct]||1)},P.autoA*1000)};
  const armQ=()=>{clearTimeout(AK.at);if(!AK.auto)return;ring(P.autoQ);AK.at=setTimeout(()=>{if(AK&&AK.list[AK.i]===it&&!AK.show)flip()},P.autoQ*1000)};
  const unring=()=>{const r=$('#aring');if(r)r.classList.remove('run')};
  bindAutoBar($('#abar'),{get on(){return AK.auto},set on(v){AK.auto=v;if(v){AK.show?armA():armQ()}else{clearTimeout(AK.at);unring()}},
    get q(){return P.autoQ},get a(){return P.autoA},get act(){return P.autoAct},
    set(k,v){P[k]=v;const PP=presets(),id=String((deck&&deck.cfgId)||'1');PP[id]=Object.assign({},PDEF,PP[id],{[k]:v});savePresets(PP)}});
  armQ();
  const grade=async(g)=>{if(busy)return;busy=true;clearTimeout(AK.at);glow(stage,g>1);SFX.play(g>1?'ok':'ng');clearInterval(AK.tmr);dogDo($('#akdog'),g>1?'hop':'tilt');sprAct($('#akdog'),g>1?'yay':'sad',g>1?900:1300);AK.dogAct=[g>1?'yay':'sad',Date.now()];fc.style.transform='';fc.classList.add(g>1?'fly-r':'fly-l');
    const prev=JSON.parse(JSON.stringify(it));const pos=AK.i;const was=it.card.state;const ms=Math.min(P.capSec*1000,Date.now()-shown0);
    const D=daily();const dsnap=JSON.parse(JSON.stringify(D));
    if(hasF)it.card=schedule(it.card,g,P);
    it.appAt=Date.now();
    // thẻ khó nhớ (leech)
    let leech=false;if(was===2&&g===1){const n=it.card.lapses||0;if(n>=P.leechN&&(n-P.leechN)%Math.max(1,Math.ceil(P.leechN/2))===0){leech=true;const s=new Set((it.tags||'').split(/\s+/).filter(Boolean));s.add('leech');it.tags=[...s].join(' ');if(P.leechAct==='suspend')it.susp=1}}
    const sib=[];if((was===0&&P.buryNew)||(was===2&&P.buryRev)){AK.list.slice(AK.i+1).forEach(c=>{if(c.nid&&c.nid===it.nid&&c.id!==it.id&&c.card.state!==1&&c.card.state!==3){c.buried=dayKey();sib.push(c)}})}
    try{await ANKI.put('cards',it);if(sib.length)await ANKI.putMany('cards',sib)}catch(e){console.error(e);toast(L('Không lưu được thẻ, anh tải lại trang giúp em','Could not save the card, please reload'))}
    try{await ANKI.logReview(it.id,[Date.now(),g,it.card.state===2?it.card.scheduled_days:-Math.round((new Date(it.card.due)-Date.now())/1000),revType(was),ms])}catch(e){console.warn('revlog',e)}
    if(leech)toast(P.leechAct==='suspend'?L('Thẻ khó nhớ, đã tạm ẩn','Leech: card suspended'):L('Thẻ khó nhớ, đã gắn tag leech','Leech: tagged'));
    D.n++;D.ms+=ms;if(g===1)D.again++;
    if(was===0){D.nw[it.deck]=(D.nw[it.deck]||0)+1}else if(was===2){D.rv[it.deck]=(D.rv[it.deck]||0)+1}
    save();
    if(g===1)AK.a++;else AK.g++;
    AK.hist.push({pos,prev,g,list:AK.list.slice(),dsnap,sib:sib.map(c=>c.id)});
    if(sib.length){const ids=new Set(sib.map(c=>c.id));const rest=AK.list.slice(AK.i+1).filter(c=>!ids.has(c.id));AK.list=AK.list.slice(0,AK.i+1).concat(rest)}
    if(it.card.state!==2&&!it.susp&&new Date(it.card.due)-Date.now()<20*60000){ // đang học: đưa lại vào hàng theo thời điểm đến hạn
      const due=new Date(it.card.due).getTime();let at=AK.list.length;
      for(let j=AK.i+1;j<AK.list.length;j++){const c=AK.list[j];if((c.card.state===1||c.card.state===3)&&new Date(c.card.due).getTime()>due){at=j;break}}
      if(AK.list.length-AK.i-1<=0||due<=Date.now())at=Math.min(AK.list.length,AK.i+1+Math.min(3,AK.list.length-AK.i-1));
      AK.list.splice(at,0,it)}
    setTimeout(()=>{AK.i++;AK.show=false;renderAnki()},230)};
  let sx=0,sy=0,dx=0,drag=false,moved=false;
  fc.addEventListener('pointerdown',e=>{if(e.target.closest('a,button,input,textarea,select'))return;sx=e.clientX;sy=e.clientY;dx=0;drag=true;moved=false;fc.style.transition='none'});
  fc.addEventListener('pointermove',e=>{if(!drag||!AK.show)return;dx=e.clientX-sx;if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(e.clientY-sy))moved=true;
    if(moved){const dy=e.clientY-sy;const rx=Math.max(-14,Math.min(14,-dy/10)),ry=Math.max(-22,Math.min(22,dx/9));fc.style.transform=`translateX(${dx}px) rotate(${dx/26}deg) rotateY(${180+ry}deg) rotateX(${rx}deg)`;fc.style.setProperty('--shx',(50-dx/4)+'%');fc.classList.toggle('tint-r',dx>40);fc.classList.toggle('tint-l',dx<-40)}});
  const end=e=>{if(!drag)return;drag=false;fc.style.transition='';fc.classList.remove('tint-r','tint-l');
    if(!AK.show){if(Math.abs(e.clientX-sx)<12&&Math.abs(e.clientY-sy)<12)flip();return}
    if(moved){if(dx>70)return grade(3);if(dx<-70)return grade(1);fc.style.transform='';return}
    if(Math.abs(e.clientY-sy)>12)return;
    const r=stage.getBoundingClientRect();grade(e.clientX>r.left+r.width/2?3:1)};
  $('#gq').onclick=()=>{if(AK.show)grade(1)};$('#gn').onclick=()=>{if(AK.show)grade(3)};
  fc.addEventListener('pointerup',end);fc.addEventListener('pointercancel',()=>{drag=false;fc.style.transform='';fc.style.transition=''});
  AK.key=e=>{if(e.target.closest&&e.target.closest('input,textarea,select'))return;
    if(!AK.show){if(e.key===' '||e.key==='Enter'){e.preventDefault();flip()}}
    else if(e.key==='2'||e.key==='4'){e.preventDefault();grade(+e.key)}
    else if(e.key==='ArrowRight'||e.key==='3'||e.key===' '||e.key==='Enter'){e.preventDefault();grade(3)}
    else if(e.key==='ArrowLeft'||e.key==='1'){e.preventDefault();grade(1)}
    if((e.key==='z'&&(e.ctrlKey||e.metaKey))||e.key==='Backspace'){e.preventDefault();undoAnki()}};
}
async function undoAnki(){
  const h=AK.hist.pop();if(!h)return;
  AK.list=h.list.slice();AK.list[h.pos]=h.prev;AK.i=h.pos;AK.show=false;
  if(h.g===1)AK.a--;else AK.g--;
  S.daily=h.dsnap;save();
  try{await ANKI.put('cards',h.prev);const r=await ANKI.getRev(h.prev.id);if(r){r.logs.pop();await ANKI.put('revlog',r)}
    if(h.sib&&h.sib.length){const all=await ANKI.all('cards');const back=all.filter(c=>h.sib.includes(c.id));back.forEach(c=>{delete c.buried});await ANKI.putMany('cards',back)}}catch(e){}
  dropState();renderAnki();
}
document.addEventListener('keydown',e=>{if(AK&&AK.key)AK.key(e);else if(FV&&FV.key)FV.key(e)});

/* ---------- thống kê (giống Anki) ---------- */
const STA={deck:'',range:'m1'};
const DAY=864e5;
function dIdx(t){return Math.floor((t-dayEnd())/DAY)+1} // 0 = hôm nay (tính từ 4h sáng)
function tipAttr(s){return `data-tip="${esc(s)}"`}
function legend(items){return `<div class="lgd">${items.map(([c,l])=>`<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`}
// biểu đồ cột (có thể chồng); bins: [{label, vals:[...], tip}]
function bars(bins,colors,opt={}){
  const H=opt.h||150,n=bins.length||1,W=Math.max(300,n*6);
  const max=Math.max(1,...bins.map(b=>b.vals.reduce((a,v)=>a+v,0)));
  const bw=W/n,gap=Math.min(2,bw*.25);
  let r='';
  bins.forEach((b,i)=>{let y=H;b.vals.forEach((v,k)=>{if(!v)return;const h=v/max*(H-4);y-=h;r+=`<rect x="${(i*bw+gap/2).toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(.6,bw-gap).toFixed(2)}" height="${h.toFixed(2)}" fill="${colors[k]}"/>`});
    r+=`<rect class="hit" x="${(i*bw).toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${H}" ${tipAttr(b.tip)}/>`});
  const xl=opt.xlabels||[bins[0]&&bins[0].label,bins[Math.floor(n/2)]&&bins[Math.floor(n/2)].label,bins[n-1]&&bins[n-1].label];
  return `<div class="chart"><div class="ymax">${fmtN(max)}</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><line x1="0" y1="${H-.5}" x2="${W}" y2="${H-.5}" class="axis"/><line x1="0" y1="4" x2="${W}" y2="4" class="grid"/>${r}</svg><div class="xl">${xl.map(x=>`<span>${esc(x||'')}</span>`).join('')}</div></div>`;
}
const fmtN=n=>n>=1e4?(n/1e3).toFixed(n>=1e5?0:1)+'k':String(Math.round(n));
const fmtD=t=>new Date(t).toLocaleDateString(L('vi-VN','en-GB'),{day:'numeric',month:'numeric'});
const pct=(a,b)=>b?Math.round(a/b*1000)/10+'%':'—';
function hist(vals,edges,labelFn,color){const cnt=new Array(edges.length).fill(0);vals.forEach(v=>{let i=edges.findIndex((e,k)=>v<(edges[k+1]??Infinity));if(i<0)i=edges.length-1;cnt[i]++});
  const tot=vals.length||1;return bars(cnt.map((c,i)=>({label:labelFn(i),vals:[c],tip:`${labelFn(i)}: ${c} ${L('thẻ','cards')} (${pct(c,tot)})`})),[color],{xlabels:[labelFn(0),labelFn(Math.floor(edges.length/2)),labelFn(edges.length-1)]})}

async function stats(){
  shell(`${header()}<div class="card"><div class="sthead">${dog('','','read')}<div class="row wrapbtn stctl grow"><select class="field sm" id="sdeck"></select>
    <div class="seg sm" id="srange">${[['m1',L('1 tháng','1 month')],['m3',L('3 tháng','3 months')],['y1',L('1 năm','1 year')],['all',L('Tất cả','All')]].map(([k,l])=>`<button data-r="${k}" class="${STA.range===k?'on':''}">${l}</button>`).join('')}</div></div></div></div>
    <div id="stbody"><div class="card tiny">${L('Đang tính…','Computing…')}</div></div>`);
  const st=await ankiState();const tree=deckTree(st);
  const names=Object.keys(tree.nodes).sort((a,b)=>a.localeCompare(b));
  $('#sdeck').innerHTML=`<option value="">${L('Toàn bộ bộ sưu tập','Whole collection')}</option>`+names.map(n=>`<option value="${esc(n)}" ${STA.deck===n?'selected':''}>${esc(n)}</option>`).join('');
  $('#sdeck').onchange=e=>{STA.deck=e.target.value;drawStats(st,tree)};
  $$('#srange [data-r]').forEach(b=>b.onclick=()=>{STA.range=b.dataset.r;$$('#srange [data-r]').forEach(x=>x.classList.toggle('on',x===b));drawStats(st,tree)});
  const revRows=await ANKI.all('revlog');STA.rev=revRows;
  drawStats(st,tree);
}
function drawStats(st,tree){
  const body=$('#stbody');if(!body)return;
  const set=STA.deck&&tree.nodes[STA.deck]?nodeSet(st,tree,STA.deck):null;
  const cards=set?st.cards.filter(c=>set.has(c.deck)):st.cards;
  const cid=new Set(cards.map(c=>c.id));
  const logs=[];(STA.rev||[]).forEach(r=>{if(set&&!cid.has(r.id))return;r.logs.forEach(l=>logs.push(l))});
  const now=Date.now(),de=dayEnd(),today0=de-DAY;
  const days=STA.range==='m1'?30:STA.range==='m3'?90:STA.range==='y1'?365:Math.max(30,Math.ceil((today0-Math.min(today0,...logs.map(l=>l[0])))/DAY)+1);
  const C=['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)'];
  // --- hôm nay
  const tl=logs.filter(l=>l[0]>=today0);const tms=tl.reduce((a,l)=>a+(l[4]||0),0);const tAgain=tl.filter(l=>l[1]===1).length;
  const tMat=tl.filter(l=>l[3]===1);const tMatOk=tMat.filter(l=>l[1]>1).length;
  const tLearn=tl.filter(l=>l[3]===0).length,tRe=tl.filter(l=>l[3]===2).length,tRev=tl.filter(l=>l[3]===1).length;
  // --- số thẻ
  const cc={nw:0,ln:0,rl:0,yg:0,mt:0,su:0};cards.forEach(c=>{if(c.susp){cc.su++;return}const s=c.card.state;if(s===0)cc.nw++;else if(s===1)cc.ln++;else if(s===3)cc.rl++;else if((c.card.scheduled_days||0)>=21)cc.mt++;else cc.yg++});
  const ccl=[[L('Mới','New'),cc.nw],[L('Đang học','Learning'),cc.ln],[L('Học lại','Relearning'),cc.rl],[L('Non (<21 ngày)','Young'),cc.yg],[L('Thuộc (≥21 ngày)','Mature'),cc.mt],[L('Tạm ẩn','Suspended'),cc.su]];
  const ctot=cards.length||1;
  // --- sắp đến hạn
  const fd=Math.min(days,365);const fut=new Array(fd).fill(0);let overdue=0;
  cards.forEach(c=>{if(c.susp||c.card.state===0)return;const i=dIdx(new Date(c.card.due).getTime());if(i<0)overdue++;else if(i<fd)fut[i]++});
  const futBins=fut.map((v,i)=>({label:i===0?L('Hôm nay','Today'):'+'+i,vals:[i===0?v+overdue:v],tip:`${i===0?L('Hôm nay','Today'):fmtD(today0+i*DAY)}: ${i===0?v+overdue:v} ${L('thẻ','cards')}`}));
  const futTot=fut.reduce((a,b)=>a+b,0)+overdue;
  // --- lượt ôn mỗi ngày theo loại
  const rv=Array.from({length:days},()=>[0,0,0,0]);const rvT=Array.from({length:days},()=>0);
  logs.forEach(l=>{const i=days-1+dIdx(l[0]);if(i<0||i>=days)return;const t=l[3]===0?0:l[3]===2?1:(l[2]>=21?3:2);if(l[3]>2)return;rv[i][t]++;rvT[i]+=l[4]||0});
  const rvBins=rv.map((v,i)=>{const d=today0-(days-1-i)*DAY;const s=v.reduce((a,b)=>a+b,0);return {label:fmtD(d),vals:v,tip:`${fmtD(d)}: ${s} ${L('lượt','reviews')} · ${Math.round(rvT[i]/60000)} ${L('phút','min')}`}});
  const rvTot=rv.reduce((a,v)=>a+v.reduce((x,y)=>x+y,0),0),rvDays=rv.filter(v=>v.some(Boolean)).length,rvMs=rvT.reduce((a,b)=>a+b,0);
  // --- lịch (heatmap 1 năm)
  const perDay={};logs.forEach(l=>{const i=dIdx(l[0]);perDay[i]=(perDay[i]||0)+1});
  let streak=0;for(let i=0;;i--){if(perDay[i])streak++;else if(i===0)continue;else break}
  const hmMax=Math.max(1,...Object.values(perDay));
  const weeks=53;const start=today0-((weeks-1)*7+new Date(today0).getDay())*DAY;
  let hm='';for(let w=0;w<weeks;w++){for(let d=0;d<7;d++){const t=start+(w*7+d)*DAY;if(t>today0)continue;const i=dIdx(t+3600e3);const v=perDay[i]||0;const lv=v?Math.min(4,Math.ceil(v/hmMax*4)):0;
    hm+=`<rect x="${w*12}" y="${d*12}" width="10" height="10" rx="2" class="hm${lv}" ${tipAttr(`${new Date(t).toLocaleDateString(L('vi-VN','en-GB'))}: ${v} ${L('lượt','reviews')}`)}/>`}}
  // --- khoảng cách, độ khó, độ ổn định, khả năng nhớ
  const rc=cards.filter(c=>!c.susp&&c.card.state!==0);
  const ivls=rc.map(c=>c.card.scheduled_days||0);
  const ivlE=[0,1,2,3,4,5,7,10,14,21,30,45,60,90,120,180,270,365,730];
  const ivlLab=i=>i===ivlE.length-1?'≥'+fmtIvl(ivlE[i]):fmtIvl(ivlE[i])||L('<1 ngày','<1d');
  const dif=rc.filter(c=>c.card.difficulty).map(c=>(c.card.difficulty-1)/9*100);
  const difE=Array.from({length:10},(_,i)=>i*10);
  const stab=rc.map(c=>c.card.stability||0);
  const retrs=rc.map(c=>retr(c,now)*100);const retE=Array.from({length:10},(_,i)=>i*5+50);const retL=i=>i===0?'<55%':retE[i]+'%';
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  // --- theo giờ
  const hr=Array.from({length:24},()=>[0,0]);logs.filter(l=>l[0]>=today0-(days-1)*DAY).forEach(l=>{const h=new Date(l[0]).getHours();hr[h][0]++;if(l[1]>1)hr[h][1]++});
  // --- nút trả lời
  const ab={0:[0,0],1:[0,0],2:[0,0]};logs.filter(l=>l[0]>=today0-(days-1)*DAY&&l[3]<=2).forEach(l=>{const t=l[3]===1?(l[2]>=21?2:1):0;ab[t][0]++;if(l[1]>1)ab[t][1]++});
  // --- thẻ mới thêm
  const ad=new Array(days).fill(0);cards.forEach(c=>{const t=createdAt(c);if(!t)return;const i=days-1+dIdx(t);if(i>=0&&i<days)ad[i]++});
  // --- tỉ lệ nhớ thật
  const tr=(from)=>{const x=logs.filter(l=>l[0]>=from&&l[3]===1);const y=x.filter(l=>l[2]<21&&true),m=x.filter(l=>l[2]>=21);return [x.length,x.filter(l=>l[1]>1).length]};
  const trRows=[[L('Hôm nay','Today'),today0],[L('Hôm qua','Yesterday'),today0-DAY],[L('7 ngày','Last week'),today0-6*DAY],[L('30 ngày','Last month'),today0-29*DAY],[L('1 năm','Last year'),today0-364*DAY],[L('Tất cả','All time'),0]];

  body.innerHTML=`
  <div class="card"><div class="ct">${L('Hôm nay','Today')}</div>
    <p class="small" style="margin:6px 0">${tl.length?L(`Đã học <b>${tl.length}</b> thẻ trong <b>${Math.round(tms/60000)}</b> phút (${(tms/1000/tl.length).toFixed(1)} giây/thẻ).`,`Studied <b>${tl.length}</b> cards in <b>${Math.round(tms/60000)}</b> minutes (${(tms/1000/tl.length).toFixed(1)}s/card).`):L('Hôm nay chưa học thẻ nào.','No cards studied today.')}</p>
    ${tl.length?`<p class="tiny" style="margin:0">${L('Quên','Again')}: ${tAgain} (${pct(tl.length-tAgain,tl.length)} ${L('đúng','correct')}) · ${L('Học','Learn')}: ${tLearn} · ${L('Ôn','Review')}: ${tRev} · ${L('Học lại','Relearn')}: ${tRe}${tMat.length?` · ${L('Tỉ lệ nhớ thẻ ôn','Review pass rate')}: ${pct(tMatOk,tMat.length)}`:''}</p>`:''}</div>
  <div class="stgrid">
  <div class="card"><div class="ct">${L('Sắp đến hạn','Future due')}</div>${bars(futBins,['var(--s1)'])}
    <div class="kv"><span>${L('Tổng','Total')}</span><b>${futTot}</b><span>${L('Trung bình','Average')}</span><b>${Math.round(futTot/fd)} ${L('thẻ/ngày','cards/day')}</b><span>${L('Ngày mai','Tomorrow')}</span><b>${fut[1]||0} ${L('thẻ','cards')}</b><span>${L('Quá hạn','Overdue')}</span><b>${overdue}</b></div></div>
  <div class="card"><div class="ct">${L('Số lượt ôn','Reviews')}</div>${legend([[C[1],L('Học','Learn')],[C[2],L('Học lại','Relearn')],[C[3],L('Non','Young')],[C[4],L('Thuộc','Mature')]])}${bars(rvBins,[C[1],C[2],C[3],C[4]])}
    <div class="kv"><span>${L('Số ngày có học','Days studied')}</span><b>${rvDays}/${days} (${pct(rvDays,days)})</b><span>${L('Tổng','Total')}</span><b>${rvTot} ${L('lượt','reviews')}</b><span>${L('Trung bình ngày có học','Avg for days studied')}</span><b>${rvDays?Math.round(rvTot/rvDays):0} ${L('lượt','reviews')}</b><span>${L('Tổng thời gian','Total time')}</span><b>${Math.round(rvMs/3600000*10)/10} ${L('giờ','h')}</b></div></div>
  </div>
  <div class="card"><div class="ct">${L('Lịch','Calendar')}</div><div class="hmwrap"><svg viewBox="0 0 ${weeks*12} 84" class="hm">${hm}</svg></div>
    <div class="tiny">${L(`Chuỗi ngày học liên tiếp: ${streak} ngày`,`Current streak: ${streak} days`)} · ${L('Ngày học nhiều nhất','Busiest day')}: ${hmMax} ${L('lượt','reviews')}</div></div>
  <div class="stgrid">
  <div class="card"><div class="ct">${L('Số thẻ','Card counts')}</div>
    <div class="stack">${ccl.map(([l,v],i)=>v?`<i style="flex:${v};background:${C[i]}" ${tipAttr(`${l}: ${v} (${pct(v,ctot)})`)}></i>`:'').join('')}</div>
    <div class="cclist">${ccl.map(([l,v],i)=>`<div><i style="background:${C[i]}"></i><span>${l}</span><b>${v}</b><span class="tiny">${pct(v,ctot)}</span></div>`).join('')}<div><i></i><span><b>${L('Tổng','Total')}</b></span><b>${cards.length}</b><span></span></div></div></div>
  <div class="card"><div class="ct">${L('Khoảng cách ôn','Review intervals')}</div>${hist(ivls,ivlE,ivlLab,'var(--s1)')}<div class="kv"><span>${L('Trung bình','Average')}</span><b>${fmtIvl(Math.round(avg(ivls)))}</b><span>${L('Dài nhất','Longest')}</span><b>${fmtIvl(Math.max(0,...ivls))}</b></div></div>
  <div class="card"><div class="ct">${L('Độ khó của thẻ','Card difficulty')}</div>${hist(dif,difE,i=>difE[i]+'%','var(--s1)')}<div class="kv"><span>${L('Trung bình','Average')}</span><b>${Math.round(avg(dif))}%</b></div></div>
  <div class="card"><div class="ct">${L('Độ ổn định','Card stability')}</div>${hist(stab,ivlE,ivlLab,'var(--s1)')}<div class="kv"><span>${L('Trung bình','Average')}</span><b>${fmtIvl(Math.round(avg(stab)))}</b></div></div>
  <div class="card"><div class="ct">${L('Khả năng nhớ hiện tại','Card retrievability')}</div>${hist(retrs,retE,retL,'var(--s1)')}<div class="kv"><span>${L('Trung bình','Average')}</span><b>${Math.round(avg(retrs))}%</b><span>${L('Ước tính số thẻ đang nhớ','Estimated total knowledge')}</span><b>${Math.round(retrs.reduce((a,b)=>a+b,0)/100)} ${L('thẻ','cards')}</b></div></div>
  <div class="card"><div class="ct">${L('Theo giờ trong ngày','Hourly breakdown')}</div>${bars(hr.map((v,h)=>({label:h+'h',vals:[v[0]],tip:`${h}:00–${h+1}:00 · ${v[0]} ${L('lượt','reviews')} · ${pct(v[1],v[0])} ${L('nhớ','correct')}`})),['var(--s1)'],{xlabels:['0h','12h','23h']})}</div>
  <div class="card"><div class="ct">${L('Nút trả lời','Answer buttons')}</div>
    <div class="kv">${[[L('Thẻ đang học','Learning'),ab[0]],[L('Thẻ non','Young'),ab[1]],[L('Thẻ thuộc','Mature'),ab[2]]].map(([l,v])=>`<span>${l}</span><b>${pct(v[1],v[0])} ${L('nhớ','correct')} <span class="tiny">(${v[1]}/${v[0]})</span></b>`).join('')}</div>
    <div class="meter2">${[ab[0],ab[1],ab[2]].map((v,i)=>`<div><span class="tiny">${[L('Đang học','Learning'),L('Non','Young'),L('Thuộc','Mature')][i]}</span><div class="mt"><i class="ok" style="width:${v[0]?v[1]/v[0]*100:0}%"></i></div></div>`).join('')}</div></div>
  <div class="card"><div class="ct">${L('Thẻ mới thêm','Added')}</div>${bars(ad.map((v,i)=>({label:fmtD(today0-(days-1-i)*DAY),vals:[v],tip:`${fmtD(today0-(days-1-i)*DAY)}: ${v} ${L('thẻ','cards')}`})),['var(--s1)'])}<div class="kv"><span>${L('Tổng','Total')}</span><b>${ad.reduce((a,b)=>a+b,0)} ${L('thẻ','cards')}</b></div></div>
  </div>
  <div class="card"><div class="ct">${L('Tỉ lệ nhớ thật (thẻ ôn)','True retention (reviews)')}</div>
    <table class="tbl"><tr><th></th><th>${L('Nhớ','Pass')}</th><th>${L('Quên','Fail')}</th><th>${L('Tỉ lệ','Retention')}</th></tr>${trRows.map(([l,f],i)=>{const to=i===1?today0:Infinity;const x=logs.filter(z=>z[0]>=f&&z[0]<to&&z[3]===1);const ok=x.filter(z=>z[1]>1).length;return `<tr><td>${l}</td><td>${ok}</td><td>${x.length-ok}</td><td><b>${pct(ok,x.length)}</b></td></tr>`}).join('')}</table></div>`;
  bindTips(body);
}
let TIP=null;
function bindTips(root){
  if(!TIP){TIP=document.createElement('div');TIP.className='tip';document.body.appendChild(TIP)}
  const show=(e,el)=>{TIP.textContent=el.dataset.tip;TIP.style.display='block';const x=Math.min(window.innerWidth-TIP.offsetWidth-8,Math.max(8,e.clientX-TIP.offsetWidth/2));TIP.style.left=x+'px';TIP.style.top=Math.max(8,e.clientY-TIP.offsetHeight-14)+'px';
    $$('.hit.on,.hm rect.on').forEach(x=>x.classList.remove('on'));el.classList.add('on')};
  root.querySelectorAll('[data-tip]').forEach(el=>{el.addEventListener('pointermove',e=>show(e,el));el.addEventListener('pointerdown',e=>show(e,el));el.addEventListener('pointerleave',()=>{TIP.style.display='none';el.classList.remove('on')})});
}

/* ---------- điểm yếu (luyện đề) ---------- */
function examStats(){
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
  <div class="card">${list.length?list.map(([k,r])=>`<div class="list-item"><div class="grow" style="font-size:15px">${esc(k)}</div><div class="meter ${r.c/r.n<.6?'low':''}" style="max-width:100px"><i style="width:${r.c/r.n*100}%"></i></div><b style="min-width:48px;text-align:right">${r.c}/${r.n}</b></div>`).join(''):`<div class="empty">${dog('','','read')}${L('Làm vài câu là ở đây có số liệu.','Answer a few questions to see numbers here.')}</div>`}</div>
  <div class="h">${L('Điểm ngữ pháp, từ vựng đang sai','Grammar and words you keep missing')}</div>
  <div class="card">${Object.keys(tags).length?`<div class="row" style="flex-wrap:wrap;gap:8px">${Object.keys(tags).map(t=>`<span class="chip jp">${esc(t)}</span>`).join('')}</div>`:`<div class="tiny">${L('Chưa có.','None yet.')}</div>`}</div>
  <div class="h">${L('Dữ liệu','Data')}</div>
  <div class="card"><div class="row"><button class="btn line" id="exp">${L('Sao lưu','Back up')}</button><button class="btn line" id="imp">${L('Khôi phục','Restore')}</button></div><p class="tiny" style="margin:10px 0 0">${L('Tiến độ lưu trong máy này. Sao lưu ra file để chuyển máy.','Progress is stored on this device. Back up to a file to move devices.')}</p></div>`);
  $('#exp').onclick=()=>{const b=new Blob([JSON.stringify(S)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='shiratama-saoluu-'+new Date().toISOString().slice(0,10)+'.json';a.click()};
  $('#imp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=async()=>{try{const d=JSON.parse(await i.files[0].text());if(!d.ans)throw 0;S=Object.assign(structuredClone(DEF),d);save();toast(L('Đã khôi phục','Restored'));render()}catch(e){toast(L('File không hợp lệ','Invalid file'))}};i.click()};
}

/* ---------- nhạc nền (tự sinh bằng Web Audio, không dùng file nhạc) ---------- */
const MUSIC=(()=>{
  // Hai bản nhạc tự sinh: ban ngày sáng, nhịp vừa, piano + đàn tre; ban đêm chậm, trầm, mơ màng, nhiều vang.
  let ctx=null,master=null,dry=null,wet=null,timer=null,step=0,nextT=0,cur=null;
  const hz=m=>440*Math.pow(2,(m-69)/12);
  const SONG={
    day:{beat:.55,chords:[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,62]],scale:[0,2,4,7,9,12,14,16,19,21,24],pluckP:[.75,.45],reg:24,wet:.35,cut:3400,padG:.03},
    night:{beat:.95,chords:[[50,57,61,64,66],[47,54,57,61],[43,50,54,57,61],[45,52,56,59]],scale:[0,2,4,6,7,9,11,12,14,16,18],pluckP:[.45,.2],reg:12,wet:.6,cut:1800,padG:.038}};
  function verb(sec){const len=ctx.sampleRate*sec,b=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}const v=ctx.createConvolver();v.buffer=b;return v}
  let lp=null;
  function init(){ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=0;
    lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3000;const rv=verb(4);wet=ctx.createGain();wet.gain.value=.4;
    master.connect(lp);lp.connect(ctx.destination);lp.connect(rv);rv.connect(wet);wet.connect(ctx.destination)}
  // pad liền mạch: mỗi hợp âm vào sớm và tắt muộn để chồng lên nhau, không có khoảng lặng
  function pad(m,t,dur,g){[-4,4].forEach(det=>{const o=ctx.createOscillator(),a=ctx.createGain();o.type='sine';o.frequency.value=hz(m);o.detune.value=det;
    a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(g,t+1.6);a.gain.setValueAtTime(g,t+dur);a.gain.linearRampToValueAtTime(0,t+dur+2.4);o.connect(a);a.connect(master);o.start(t);o.stop(t+dur+2.5)})}
  function pluck(m,t,v,soft){const o=ctx.createOscillator(),o2=ctx.createOscillator(),a=ctx.createGain(),a2=ctx.createGain();o.type=soft?'sine':'triangle';o2.type='sine';o.frequency.value=hz(m);o2.frequency.value=hz(m+12);
    a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(v,t+.012);a.gain.exponentialRampToValueAtTime(.0006,t+(soft?3.4:2.2));a2.gain.value=soft?.12:.28;
    o.connect(a);o2.connect(a2);a2.connect(a);a.connect(master);o.start(t);o2.start(t);o.stop(t+3.5);o2.stop(t+3.5)}
  function mode(){return isNight()?'night':'day'}
  function tick(){
    while(nextT<ctx.currentTime+2){
      const m=mode();if(m!==cur&&step%8===0){cur=m;const X=SONG[m];wet.gain.setTargetAtTime(X.wet,ctx.currentTime,1.5);lp.frequency.setTargetAtTime(X.cut,ctx.currentTime,1.5)}
      const X=SONG[cur||m];const bar=Math.floor(step/8)%X.chords.length;const ch=X.chords[bar];
      if(step%8===0)ch.forEach(n=>pad(n,nextT,X.beat*8,X.padG));
      if(Math.random()<X.pluckP[step%2]){const n=ch[0]+X.reg+X.scale[Math.floor(Math.random()*X.scale.length)]-12;pluck(n,nextT+Math.random()*.03,(cur==='night'?.05:.07)+Math.random()*.04,cur==='night')}
      if(step%8===0)pluck(ch[0]+12,nextT,.05,cur==='night');
      if(cur==='night'&&step%16===12&&Math.random()<.6)pluck(ch[ch.length-1]+24,nextT,.03,true); // tiếng chuông xa
      nextT+=X.beat;step++}}
  function alive(){if(!ctx)return;if(ctx.state!=='running')ctx.resume().catch(()=>{});if(!timer){nextT=Math.max(nextT,ctx.currentTime+.1);timer=setInterval(tick,250);tick()}}
  const api={on:false,
    start(){if(!ctx)init();alive();api.vol()},
    stop(){if(!ctx)return;master.gain.setTargetAtTime(0,ctx.currentTime,.4);setTimeout(()=>{if(!api.on){clearInterval(timer);timer=null;ctx.suspend()}},1500)},
    vol(){if(ctx&&api.on)master.gain.setTargetAtTime((S.vol??0.5)*0.9,ctx.currentTime,.6)},
    set(v){api.on=v;S.music=v?1:0;save();v?api.start():api.stop()},
    toggle(){api.set(!api.on)}};
  api.on=!!S.music;
  // iPhone hay tạm dừng âm thanh (khóa máy, chuyển app, có cuộc gọi): mỗi lần chạm lại thì bật lại nhạc
  document.addEventListener('pointerdown',()=>{if(api.on)api.start()},{passive:true});
  document.addEventListener('keydown',()=>{if(api.on)api.start()});
  document.addEventListener('visibilitychange',()=>{if(!ctx||!api.on)return;if(document.hidden){ctx.suspend();clearInterval(timer);timer=null}else api.start()});
  window.addEventListener('pageshow',()=>{if(api.on&&ctx)api.start()});
  return api;
})();
/* ---------- hiệu ứng âm thanh (tự sinh, không dùng file) ---------- */
const SFX=(()=>{
  let ctx=null,out=null;
  const on=()=>S.sfx!==0;
  function init(){if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();out=ctx.createGain();out.connect(ctx.destination)}
  function vol(){return (S.sfxv??0.6)*0.9}
  function tone(f,t,dur,type,g,f2){const o=ctx.createOscillator(),a=ctx.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);
    a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(g*vol(),t+.008);a.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(a);a.connect(out);o.start(t);o.stop(t+dur+.02)}
  function noise(t,dur,g,from,to){const n=ctx.sampleRate*dur,b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource();src.buffer=b;const f=ctx.createBiquadFilter();f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(from,t);f.frequency.exponentialRampToValueAtTime(to,t+dur);
    const a=ctx.createGain();a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(g*vol(),t+dur*.3);a.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(f);f.connect(a);a.connect(out);src.start(t);src.stop(t+dur)}
  const P={
    flip(t){noise(t,.22,.5,900,3200)},                       // lật thẻ: tiếng giấy lướt
    ok(t){tone(880,t,.35,'sine',.22);tone(1318.5,t+.07,.5,'sine',.2);tone(2637,t+.07,.25,'sine',.04)},  // Nhớ: chuông hai nốt đi lên
    ng(t){tone(392,t,.28,'triangle',.2,330);tone(294,t+.09,.35,'sine',.14)},                           // Quên: hai nốt trầm đi xuống, nhẹ
    tap(t){tone(1500,t,.05,'sine',.12)},                     // chạm nút
    tab(t){tone(660,t,.09,'sine',.14,990)},                  // đổi tab: "pop"
    undo(t){tone(990,t,.12,'sine',.14,520)},
    buzz(t){const o=ctx.createOscillator(),l=ctx.createOscillator(),lg=ctx.createGain(),a=ctx.createGain();o.type='sawtooth';o.frequency.value=230;l.frequency.value=38;lg.gain.value=40;l.connect(lg);lg.connect(o.frequency);
      const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=900;a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(.08*vol(),t+.05);a.gain.linearRampToValueAtTime(.0001,t+.5);o.connect(f);f.connect(a);a.connect(out);o.start(t);l.start(t);o.stop(t+.52);l.stop(t+.52)}, // chó ong vo ve
    woof(t){tone(620,t,.12,'triangle',.22,420);tone(700,t+.16,.14,'triangle',.18,460)},  // "gâu gâu" nhỏ
    done(t){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,t+i*.09,.6,'sine',.16))},
    open(t){tone(523.25,t,.25,'sine',.12);tone(783.99,t+.1,.4,'sine',.12)}};
  return {play(k){if(!on())return;try{init();if(ctx.state==='suspended')ctx.resume();P[k](ctx.currentTime+.01)}catch(e){}},set(v){S.sfx=v?1:0;save()},get on(){return on()}};
})();
// tiếng chạm cho mọi nút
document.addEventListener('pointerdown',e=>{const b=e.target.closest('button,.dn');if(!b||b.id==='fc'||b.closest('#fc'))return;if(b.matches('[data-tab],[data-sub]'))SFX.play('tab');else SFX.play('tap')},{passive:true});
/* ---------- bộ thẻ dựng sẵn ---------- */
async function openBundle(code){
  if(!window.ANKI)return;
  try{const r=await ANKI.loadBundle(code,t=>{ensureSky();const it=document.getElementById('intro');if(it){const m=it.querySelector('.intro-msg');if(m)m.textContent=t}else $('#app').innerHTML=`<div class="wrap"><div class="card center" style="margin-top:30vh">${dog('big','','load')}<div class="small muted">${esc(t)}</div></div></div>`});
    if(r){dropState();setTimeout(()=>toast(L(`Đã nạp ${r.cards} thẻ cùng lịch sử học`,`Loaded ${r.cards} cards with history`)),300)}
    await seedGram()}
  catch(e){console.warn(e);setTimeout(()=>toast(L('Chưa nạp được bộ thẻ','Could not load the card collection')),300)}
}
/* shiratama — đồng bộ tiến độ giữa các máy (Firestore REST, không cần SDK)
   Dữ liệu nằm ở shiratama/{mã-băm}/s/{0..15, meta}. Mã băm tính từ mã mở app, nên máy nào nhập cùng mã là cùng một kho.
   Mỗi thẻ có mt (thời điểm sửa cuối); khi gộp, bản nào mới hơn thì thắng. */
const SYNC=(()=>{
  // database riêng của Shiratama (dự án Firebase của anh Nhân). Để null thì tắt đồng bộ.
  const FB={apiKey:'AIzaSyAfjtTIWLIyUp49h8tsitJjd2LWuHnqyxE',project:'shiratama-c5cc1'};
  const ROOT=FB?`projects/${FB.project}/databases/(default)/documents`:'';
  const API='https://firestore.googleapis.com/v1/';
  const NS=16;
  try{localStorage.removeItem('shiratama-auth')}catch(e){}
  let AUTH=ls.get('shiratama-auth2',null);if(AUTH&&FB&&AUTH.p!==FB.project)AUTH=null;
  let SPACE=null,running=null,again=false,timer=null,track=false;
  const st={state:'off',at:ls.get('shiratama-syncat',0),err:''};
  let dirty=ls.get('shiratama-dirty',{});       // id thẻ -> mt
  let tomb=ls.get('shiratama-tomb',{});          // id thẻ đã xóa -> lúc xóa
  let metaDirty=ls.get('shiratama-metad',0);
  const saveDirty=()=>{ls.set('shiratama-dirty',dirty);ls.set('shiratama-tomb',tomb);ls.set('shiratama-metad',metaDirty)};

  async function idToken(){
    if(AUTH&&AUTH.exp>Date.now()+120000)return AUTH.idToken;
    let r,j;
    if(AUTH&&AUTH.refreshToken){
      r=await fetch('https://securetoken.googleapis.com/v1/token?key='+FB.apiKey,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(AUTH.refreshToken)});
      if(r.ok){j=await r.json();AUTH={idToken:j.id_token,refreshToken:j.refresh_token,exp:Date.now()+(+j.expires_in)*1000};AUTH.p=FB.project;ls.set('shiratama-auth2',AUTH);return AUTH.idToken}
    }
    r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+FB.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"returnSecureToken":true}'});
    if(!r.ok)throw new Error('auth '+r.status);
    j=await r.json();AUTH={idToken:j.idToken,refreshToken:j.refreshToken,exp:Date.now()+(+j.expiresIn)*1000};AUTH.p=FB.project;ls.set('shiratama-auth2',AUTH);return AUTH.idToken;
  }
  async function spaceOf(code){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('shiratama-sync|'+code.trim()));return [...new Uint8Array(b)].slice(0,20).map(x=>x.toString(16).padStart(2,'0')).join('')}
  const docs=()=>[...Array(NS).keys()].map(String).concat('meta');
  const path=k=>`shiratama/${SPACE}/s/${k}`;
  async function pull(){
    const r=await fetch(API+ROOT+':batchGet',{method:'POST',headers:{Authorization:'Bearer '+await idToken(),'Content-Type':'application/json'},body:JSON.stringify({documents:docs().map(k=>ROOT+'/'+path(k))})});
    if(!r.ok){const e=new Error('pull '+r.status);e.status=r.status;throw e}
    const out={};
    (await r.json()).forEach(x=>{if(x.found){const k=x.found.name.split('/').pop();let data={};try{data=JSON.parse(x.found.fields.data.stringValue||'{}')}catch(e){}out[k]={data,ut:x.found.updateTime}}else if(x.missing){out[x.missing.split('/').pop()]={data:{},ut:null}}});
    docs().forEach(k=>{if(!out[k])out[k]={data:{},ut:null}});
    return out;
  }
  async function push(k,data,ut){
    const s=JSON.stringify(data);if(s.length>890000)throw new Error('shard '+k+' too big');
    const q='?updateMask.fieldPaths=data&updateMask.fieldPaths=updated&'+(ut?'currentDocument.updateTime='+encodeURIComponent(ut):'currentDocument.exists=false');
    const r=await fetch(API+ROOT+'/'+path(k)+q,{method:'PATCH',headers:{Authorization:'Bearer '+await idToken(),'Content-Type':'application/json'},body:JSON.stringify({fields:{data:{stringValue:s},updated:{integerValue:String(Date.now())}}})});
    if(!r.ok){const e=new Error('push '+r.status);e.status=r.status;throw e}
  }
  const shardOf=id=>{let h=0;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))|0;return String(Math.abs(h)%NS)};
  const cut=()=>(+ls.get('shiratama-colv',0)||0)*1000;  // lịch sử trước mốc này đã có sẵn trong bộ thẻ
  const HEAVY=['front','back','fl','guid','nid','created','ord','tmpl','css'];
  async function recOf(c){
    const rec={mt:c.mt||c.appAt||Date.now(),card:c.card,susp:c.susp||0,tags:c.tags||'',deck:c.deck,buried:c.buried||null,appAt:c.appAt||0};
    if(c.edited||c.id[0]==='n'){HEAVY.forEach(k=>{if(c[k]!==undefined)rec[k]=c[k]});rec.edited=c.edited||0;rec.full=1}
    const rv=await ANKI.getRev(c.id);const t0=cut();if(rv&&rv.logs){const l=rv.logs.filter(x=>x[0]>t0);if(l.length)rec.l=l}
    return rec;
  }
  // ghi vào máy mà không đánh dấu là "cần gửi đi"
  const raw={};
  async function applyRemote(R){
    let changed=0;const cards=await raw.all('cards');const byId=new Map(cards.map(c=>[c.id,c]));
    const puts=[],dels=[];const revs=[];
    for(const k of Object.keys(R)){if(k==='meta')continue;const data=R[k].data;
      for(const id in data){const rec=data[id];const loc=byId.get(id);const lmt=loc?(loc.mt||loc.appAt||0):0;
        if(dirty[id]&&dirty[id]>=rec.mt)continue;
        if(rec.x){if(loc&&rec.mt>lmt){dels.push(id);changed++}continue}
        if(rec.mt<=lmt)continue;
        if(loc&&loc.card&&rec.card&&new Date(loc.card.last_review||0)>new Date(rec.card.last_review||0))continue;
        if(!loc&&!rec.full)continue;
        const c=Object.assign({},loc||{id},{card:rec.card,susp:rec.susp,tags:rec.tags,deck:rec.deck,buried:rec.buried,appAt:rec.appAt,mt:rec.mt});
        if(rec.full)HEAVY.concat('edited').forEach(f=>{if(rec[f]!==undefined)c[f]=rec[f]});
        puts.push(c);changed++;
        if(rec.l)revs.push([id,rec.l])}}
    if(puts.length)await raw.putMany('cards',puts);
    for(const id of dels)await raw.del('cards',id);
    for(const [id,l] of revs){const rv=(await ANKI.getRev(id))||{id,logs:[]};const have=new Set(rv.logs.map(x=>x[0]));let add=0;l.forEach(x=>{if(!have.has(x[0])){rv.logs.push(x);add++}});if(add){rv.logs.sort((a,b)=>a[0]-b[0]);await raw.put('revlog',rv)}}
    // deck và bộ cài đặt
    const M=R.meta&&R.meta.data;
    if(M&&M.mt&&M.mt>(ls.get('shiratama-metamt',0)||0)&&!(metaDirty&&metaDirty>=M.mt)){
      const ld=await raw.all('decks');const lm=new Map(ld.map(d=>[d.id,d]));
      const up=(M.decks||[]).map(d=>Object.assign({},lm.get(d.id)||{},d));if(up.length)await raw.putMany('decks',up);
      for(const id of (M.dx||[]))if(lm.has(id))await raw.del('decks',id);
      if(M.presets)ls.set('shiratama-presets',M.presets);
      ls.set('shiratama-metamt',M.mt);changed++}
    return changed;
  }
  // ảnh anh tự thêm: mỗi ảnh một doc riêng s/m_<tên>, chỉ tải về khi thẻ cần
  const mdoc=n=>'m_'+String(n).replace(/[^\w.-]/g,'_');
  const blobB64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(String(f.result).split(',')[1]);f.readAsDataURL(b)});
  function putMedia(n){const q=ls.get('shiratama-mpend',[])||[];if(!q.includes(n)){q.push(n);ls.set('shiratama-mpend',q)}if(FB&&SPACE)soon()}
  async function flushMedia(){let q=ls.get('shiratama-mpend',[])||[];
    for(const n of q.slice()){const m=await raw.getMedia(n);
      if(m&&m.blob){try{await push(mdoc(n),{t:m.blob.type,b:await blobB64(m.blob)},null)}catch(e){if(e.status!==409&&e.status!==400)throw e}}
      q=q.filter(x=>x!==n);ls.set('shiratama-mpend',q)}}
  async function getMedia(n){if(!FB||!SPACE)return null;
    const r=await fetch(API+ROOT+'/'+path(mdoc(n)),{headers:{Authorization:'Bearer '+await idToken()}});if(!r.ok)return null;
    const j=await r.json();const d=JSON.parse(j.fields.data.stringValue);const blob=new Blob([b64(d.b)],{type:d.t||'image/webp'});
    try{await ANKI.put('media',{name:n,blob})}catch(e){}return blob}
  async function once(){
    const t0=Date.now();
    await flushMedia();
    const R=await pull();
    const changed=await applyRemote(R);
    // gửi phần đã đổi trên máy này
    const ids=Object.keys(dirty).concat(Object.keys(tomb));
    if(ids.length){
      const cards=await raw.all('cards');const byId=new Map(cards.map(c=>[c.id,c]));
      const by={};ids.forEach(id=>{(by[shardOf(id)]=by[shardOf(id)]||[]).push(id)});
      for(const k of Object.keys(by)){const data=Object.assign({},R[k].data);
        for(const id of by[k]){if(tomb[id]){const r=data[id];if(!r||r.mt<tomb[id])data[id]={x:1,mt:tomb[id]};continue}
          const c=byId.get(id);if(!c)continue;const rec=await recOf(c);const r=data[id];if(!r||r.mt<=rec.mt)data[id]=rec}
        await push(k,data,R[k].ut)}
    }
    if(metaDirty){const decks=(await raw.all('decks')).map(d=>{const o={id:d.id,name:d.name,cfgId:d.cfgId||'1',at:d.at||0};if(d.mode)o.mode=d.mode;if(d.ord!=null)o.ord=d.ord;return o});
      const M=R.meta.data||{};const dx=(M.dx||[]).slice();(ls.get('shiratama-deckdel',[])||[]).forEach(id=>{if(!dx.includes(id))dx.push(id)});
      const mt=Math.max(metaDirty,Date.now());await push('meta',{mt,decks,dx,presets:ls.get('shiratama-presets',null)},R.meta.ut);ls.set('shiratama-metamt',mt)}
    // xóa đánh dấu những gì đã gửi xong (thẻ sửa trong lúc đang đồng bộ thì giữ lại cho lần sau)
    ids.forEach(id=>{if(dirty[id]&&dirty[id]<=t0)delete dirty[id];if(tomb[id]&&tomb[id]<=t0)delete tomb[id]});
    if(metaDirty&&metaDirty<=t0)metaDirty=0;saveDirty();
    return changed;
  }
  function paint(){document.querySelectorAll('[data-sync]').forEach(el=>{el.className='syncchip '+st.state;el.innerHTML=chipInner()});const s=document.getElementById('sysync');if(s)s.innerHTML=detail()}
  const hm=t=>new Date(t).toLocaleTimeString(L('vi-VN','en-GB'),{hour:'2-digit',minute:'2-digit'});
  function ago(t){if(!t)return L('chưa lần nào','never');const d=new Date(t),n=new Date();const same=d.toDateString()===n.toDateString();return same?L('lúc ','at ')+hm(t):d.toLocaleDateString(L('vi-VN','en-GB'))+' '+hm(t)}
  const CLOUD='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z"/></svg>';
  function chipInner(){const n=Object.keys(dirty).length+Object.keys(tomb).length;
    if(st.state==='busy')return CLOUD+'<span>'+L('Đang đồng bộ…','Syncing…')+'</span>';
    if(st.state==='rules')return CLOUD+'<span>'+L('Chưa bật đồng bộ','Sync not set up')+'</span>';
    if(st.state==='err')return CLOUD+'<span>'+L('Lỗi đồng bộ','Sync error')+'</span>';
    if(st.state==='offline')return CLOUD+'<span>'+L('Mất mạng','Offline')+(n?` · ${n}`:'')+'</span>';
    return CLOUD+'<span>'+(st.at?L('Đã đồng bộ ','Synced ')+hm(st.at):L('Chưa đồng bộ','Not synced'))+'</span>'}
  function detail(){const n=Object.keys(dirty).length+Object.keys(tomb).length;
    if(!FB)return `<div class="ohint">${L('Chưa cài database đồng bộ. Tiến độ đang lưu riêng trên từng máy.','Sync database not set up yet.')}</div>`;
    return `<div class="kv"><span>${L('Đồng bộ lần cuối','Last synced')}</span><b>${ago(st.at)}</b><span>${L('Thay đổi chờ gửi','Changes waiting')}</span><b>${n}${metaDirty?' + deck':''}</b><span>${L('Trạng thái','Status')}</span><b>${{ok:L('Ổn','OK'),busy:L('Đang đồng bộ…','Syncing…'),err:L('Lỗi','Error'),offline:L('Mất mạng','Offline'),rules:L('Chưa bật trên máy chủ','Not enabled on the server'),off:'—'}[st.state]||'—'}</b></div>${st.err?`<div class="ohint">${esc(st.err)}</div>`:''}`}
  async function run(){
    if(!SPACE)return;if(running){again=true;return running}
    st.state='busy';paint();
    running=(async()=>{try{let ch=await once();if(again){again=false;ch+=await once()}
        st.state='ok';st.err='';st.at=Date.now();ls.set('shiratama-syncat',st.at);
        if(ch){dropState();if(!AK&&!SS&&!document.querySelector('.veil')&&['home','stats','sys'].includes(TAB))render()}}
      catch(e){console.warn('sync',e);
        if(!navigator.onLine||e instanceof TypeError){st.state='offline';st.err=''}
        else if(e.status===403){st.state='rules';st.err=L('Máy chủ chưa cho phép lưu dữ liệu Shiratama. Cần thêm quy tắc Firestore (xem hướng dẫn).','The server does not allow Shiratama data yet.')}
        else if(e.status===400||e.status===409||e.status===412){st.state='ok';again=true}   // máy khác vừa ghi: thử lại
        else{st.state='err';st.err=String(e.message||e)}}
      finally{running=null;paint();if(again){again=false;setTimeout(run,800)}}})();
    return running;
  }
  const soon=()=>{clearTimeout(timer);timer=setTimeout(run,12000)};
  function wrap(){
    ['put','putMany','del','delDeck','all','getMedia'].forEach(k=>raw[k]=ANKI[k]);
    const mark=c=>{const t=Date.now();c.mt=t;dirty[c.id]=t};
    ANKI.put=async(store,v)=>{if(track&&store==='cards'){mark(v);saveDirty();soon()}if(track&&store==='decks'){metaDirty=Date.now();saveDirty();soon()}return raw.put(store,v)};
    ANKI.putMany=async(store,arr)=>{if(track&&store==='cards'){arr.forEach(mark);saveDirty();soon()}if(track&&store==='decks'){metaDirty=Date.now();saveDirty();soon()}return raw.putMany(store,arr)};
    ANKI.del=async(store,id)=>{if(track&&store==='cards'){tomb[id]=Date.now();delete dirty[id];saveDirty();soon()}return raw.del(store,id)};
    ANKI.delDeck=async(id)=>{if(track){const cs=(await raw.all('cards')).filter(c=>c.deck===id);const t=Date.now();cs.forEach(c=>{tomb[c.id]=t;delete dirty[c.id]});const dd=ls.get('shiratama-deckdel',[])||[];dd.push(id);ls.set('shiratama-deckdel',dd);metaDirty=t;saveDirty();soon()}return raw.delDeck(id)};
    const sp=savePresets;savePresets=p=>{sp(p);if(track){metaDirty=Date.now();saveDirty();soon()}};
  }
  async function start(code){
    if(!FB){st.state='off';return}
    if(!window.ANKI||SPACE)return;
    SPACE=await spaceOf(code);wrap();
    // lần đầu trên máy này: gửi những thẻ đã học hoặc sửa trong app trước khi có đồng bộ
    if(!ls.get('shiratama-syncinit',0)){const cs=await raw.all('cards');cs.forEach(c=>{if(c.appAt||c.edited||c.id[0]==='n')dirty[c.id]=c.appAt||Date.now()});metaDirty=Date.now();saveDirty();ls.set('shiratama-syncinit',1)}
    track=true;run();
    setInterval(()=>{if(!document.hidden)run()},90000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){if(Object.keys(dirty).length||Object.keys(tomb).length||metaDirty)run()}else run()});
    window.addEventListener('online',run);
    document.addEventListener('click',e=>{if(e.target.closest('[data-sync]'))run()});
  }
  return {start,run,putMedia,getMedia,chip:()=>!FB?'':`<button class="syncchip ${st.state}" data-sync>${chipInner()}</button>`,detail:()=>`<div id="sysync">${detail()}</div>`,get state(){return st},get on(){return !!FB}};
})();

/* ---------- tay cầm (controller), giống addon Contanki của Anki ---------- */
const PAD=(()=>{
  const BTN=['A','B','X','Y','LB','RB','LT','RT','View','Menu','L3','R3','↑','↓','←','→','Xbox'];
  const CTX=[['all',L('Mọi màn','Everywhere')],['q',L('Ôn thẻ: mặt trước','Review: question')],['a',L('Ôn thẻ: mặt sau','Review: answer')],['flip',L('Deck tự lướt','Flip deck')]];
  const ACT={
    none:[L('Không làm gì','Nothing')],
    select:[L('Bấm mục đang chọn','Press selected')],click:[L('Click chuột tại con trỏ','Mouse click at cursor')],back:[L('Quay lại / thoát','Back / exit')],
    up:[L('Chọn mục trên','Move up')],down:[L('Chọn mục dưới','Move down')],left:[L('Chọn mục trái','Move left')],right:[L('Chọn mục phải','Move right')],
    flip:[L('Lật thẻ','Flip card')],good:[L('Nhớ','Remembered')],again:[L('Quên','Forgot')],undo:[L('Hoàn tác','Undo')],
    next:[L('Thẻ sau','Next card')],prev:[L('Thẻ trước','Previous card')],star:[L('Gắn sao ★','Star ★')],
    sizeup:[L('Chữ to hơn','Bigger text')],sizedn:[L('Chữ nhỏ hơn','Smaller text')],menu:[L('Mở menu ⋯','Open ⋯ menu')],
    tabn:[L('Tab kế tiếp','Next tab')],tabp:[L('Tab trước','Previous tab')]};
  // mặc định theo bộ nút anh đang dùng trong Contanki (Xbox Series)
  const DEF={all:{11:'click',0:'select',1:'back',4:'tabp',5:'tabn',6:'sizedn',7:'sizeup',8:'back',9:'menu',12:'up',13:'down',14:'left',15:'right'},
    q:{0:'flip',1:'none',2:'none',3:'none',4:'undo',5:'none'},a:{0:'good',1:'again',2:'again',3:'good',4:'undo',5:'none'},
    flip:{0:'flip',1:'back',3:'star',12:'star',14:'prev',15:'next',4:'prev',5:'next'}};
  const cfg=()=>S.pad||{};
  const on=()=>cfg().on!==0;
  const map=c=>Object.assign({},DEF[c]||{},(cfg().b||{})[c]||{});
  let shown=0,raf=0,prev=[],held={},cap=null,lastId='',hint=null,focusEl=null,ax=[0,0,0,0];
  const pads=()=>[...(navigator.getGamepads?navigator.getGamepads():[])].filter(g=>g&&g.connected);
  function ctx(){if(document.querySelector('.veil'))return 'all';if(AK&&AK.list&&AK.list[AK.i])return AK.show?'a':'q';if(FV&&FV.view!=='list'&&FV.key)return 'flip';return 'all'}
  const vis=el=>{const r=el.getBoundingClientRect();return r.width>2&&r.height>2&&r.bottom>0&&r.top<innerHeight&&getComputedStyle(el).visibility!=='hidden'};
  function items(){const root=[...document.querySelectorAll('.veil')].pop()||document;
    const all=[...root.querySelectorAll('button,a[href],input,select,textarea,[data-tab],[data-sub],.dn,[tabindex]')].concat([...root.querySelectorAll('#app div,#app li,#app span')].filter(e=>e.onclick));
    return all.filter(e=>!e.disabled&&vis(e)&&!e.closest('.szpop:not(.open)'))}
  function mark(el){if(focusEl)focusEl.classList.remove('padfocus');focusEl=el;if(!el)return;el.classList.add('padfocus');try{el.focus({preventScroll:true})}catch(e){}el.scrollIntoView({block:'nearest',behavior:'smooth'})}
  function move(dx,dy){const list=items();if(!list.length)return;
    if(!focusEl||!document.contains(focusEl)||!list.includes(focusEl)){mark(list.find(e=>{const r=e.getBoundingClientRect();return r.top>=0})||list[0]);return}
    const a=focusEl.getBoundingClientRect(),ac=[a.left+a.width/2,a.top+a.height/2];let best=null,bs=1e9;
    list.forEach(e=>{if(e===focusEl||focusEl.contains(e)||e.contains(focusEl))return;const r=e.getBoundingClientRect(),c=[r.left+r.width/2,r.top+r.height/2];
      const d=[c[0]-ac[0],c[1]-ac[1]];const main=dx?d[0]*dx:d[1]*dy,side=dx?Math.abs(d[1]):Math.abs(d[0]);if(main<=4)return;const sc=main+side*2.5;if(sc<bs){bs=sc;best=e}});
    if(best)mark(best);else window.scrollBy({top:dy*160,behavior:'smooth'})}
  const key=k=>{const e={key:k,target:document.body,preventDefault(){},ctrlKey:false,metaKey:false};if(AK&&AK.key)AK.key(e);else if(FV&&FV.key)FV.key(e)};
  const click=sel=>{const el=[...document.querySelectorAll(sel)].find(vis);if(el){el.click();return true}return false};
  function back(){const v=[...document.querySelectorAll('.veil')].pop();if(v){const x=v.querySelector('.panel .iconbtn')||v.querySelector('.iconbtn');if(x)x.click();else v.remove();return}
    const p=document.querySelector('.szpop.open,#akpop.open');if(p){p.classList.remove('open');return}
    click('#fvq,#akq,#quit,#back,#eclose,#edx,#akb')}
  function tab(d){if(AK||SS||FV||document.querySelector('.veil'))return;const O=['home','browse','stats','exam','examstats','sys'];let i=O.indexOf(TAB);if(i<0)i=0;const n=O[(i+d+O.length)%O.length];
    const sb=document.querySelector(`[data-sub="${n}"]`);if(sb){sb.click();return}
    const mt=n==='browse'||n==='stats'?'home':n==='examstats'?'exam':n;const tb=document.querySelector(`[data-tab="${mt}"]`);if(tb)tb.click();
    if(TAB!==n){const s2=document.querySelector(`[data-sub="${n}"]`);if(s2)s2.click()}}
  function size(d){S.size=Math.max(0,Math.min(SIZES.length-1,S.size+d));save();applyLook();const v=document.getElementById('szv');if(v)v.textContent=SIZES[S.size]+'px';toast(SIZES[S.size]+'px')}
  function run(a){
    switch(a){
      case 'select':if(focusEl&&document.contains(focusEl)&&vis(focusEl))focusEl.click();else move(0,1);break;
      case 'back':back();break;
      case 'up':move(0,-1);break;case 'down':move(0,1);break;case 'left':move(-1,0);break;case 'right':move(1,0);break;
      case 'flip':key(' ');break;case 'good':key('3');break;case 'again':key('1');break;
      case 'undo':if(AK)key('Backspace');break;
      case 'next':key('ArrowRight');break;case 'prev':key('ArrowLeft');break;case 'star':key('s');break;
      case 'sizeup':size(1);break;case 'sizedn':size(-1);break;
      case 'menu':click('#akmenu,#opmenu,[data-menu],.dots');break;
      case 'tabn':tab(1);break;case 'tabp':tab(-1);break;
      case 'click':mclick();break}}
  // con trỏ chuột bằng cần phải, giống Contanki
  let cur=null,cx=innerWidth/2,cy=innerHeight/2,cmoved=0,hov=null,lt=0;
  const cursorOn=()=>cur&&Date.now()-cmoved<3500;
  function cursorEl(){if(!cur){cur=document.createElement('div');cur.className='padcursor';cur.innerHTML='<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15 9.2-6.6 1.4 3.9 7.3-3 1.6-3.9-7.4L4 19z" fill="#fff" stroke="#1d2b44" stroke-width="1.8" stroke-linejoin="round"/></svg>';document.body.appendChild(cur)}return cur}
  function under(){const el=document.elementFromPoint(cx,cy);return el}
  function clickable(el){return el&&el.closest('button,a[href],input,select,textarea,label,[data-tab],[data-sub],[data-fi],[data-study],[data-flipd],[data-sec],.dn,[tabindex],.fc,.frow,.opt,[onclick]')}
  function hover(){const el=clickable(under());if(el!==hov){if(hov)hov.classList.remove('padhover');hov=el;if(el)el.classList.add('padhover')}}
  function moveCursor(dx,dy){const c=cursorEl();cx=Math.max(2,Math.min(innerWidth-2,cx+dx));cy=Math.max(2,Math.min(innerHeight-2,cy+dy));
    c.style.transform=`translate(${cx}px,${cy}px)`;c.classList.add('on');cmoved=Date.now();hover()}
  function mclick(){if(!cur)return;const el=under();if(!el)return;const o={bubbles:true,cancelable:true,clientX:cx,clientY:cy,view:window,button:0};
    cur.classList.add('tap');setTimeout(()=>cur&&cur.classList.remove('tap'),160);cmoved=Date.now();
    try{el.dispatchEvent(new PointerEvent('pointerdown',Object.assign({pointerType:'mouse',isPrimary:true},o)))}catch(e){}el.dispatchEvent(new MouseEvent('mousedown',o));
    try{el.dispatchEvent(new PointerEvent('pointerup',Object.assign({pointerType:'mouse',isPrimary:true},o)))}catch(e){}el.dispatchEvent(new MouseEvent('mouseup',o));
    const t=el.closest('input,textarea,select');if(t){t.focus();if(t.tagName==='SELECT'&&t.showPicker)try{t.showPicker()}catch(e){}}
    el.dispatchEvent(new MouseEvent('click',o));setTimeout(hover,60)}
  setInterval(()=>{if(cur&&!cursorOn()){cur.classList.remove('on');if(hov){hov.classList.remove('padhover');hov=null}}},500);
  function press(b){if(cap){const c=cap;cap=null;c(b);return}if(!on())return;
    if(b===0&&cursorOn()&&ctx()==='all'){mclick();return}
    const c=ctx();let a=c!=='all'?map(c)[b]:undefined;if(a===undefined||a==='inherit')a=map('all')[b];
    if(a&&a!=='none'){run(a);shown=Date.now();legend()}}
  function scrollAt(dy){// cuộn vùng nằm dưới con trỏ (hoặc giữa màn hình)
    let el=document.elementFromPoint(cursorOn()?cx:innerWidth/2,cursorOn()?cy:innerHeight/2);
    while(el&&el!==document.body){const cs=getComputedStyle(el);if(/(auto|scroll)/.test(cs.overflowY)&&el.scrollHeight>el.clientHeight+2){el.scrollTop+=dy;return true}el=el.parentElement}return false}
  function scrollBy(dy){if(!on())return;if(scrollAt(dy))return;const f=[...document.querySelectorAll('.fvstage .face')].find(e=>vis(e)&&e.scrollHeight>e.clientHeight+2);
    const tgt=FV&&f&&f.scrollHeight>f.clientHeight?f:(document.querySelector('.sess')&&document.querySelector('.sess').scrollHeight>document.querySelector('.sess').clientHeight?document.querySelector('.sess'):null);
    if(tgt)tgt.scrollTop+=dy;else window.scrollBy(0,dy)}
  function tick(t){raf=0;const g=pads()[0];if(!g){prev=[];return}const dt=lt?Math.min(50,t-lt)/16.7:1;lt=t;
    if(g.id!==lastId){lastId=g.id;shown=Date.now();toast(L('Đã nhận tay cầm','Controller connected'));legend()}
    g.buttons.forEach((b,i)=>{const p=b.pressed||b.value>.5;
      if(p&&!prev[i]){held[i]=t;press(i)}
      else if(p&&prev[i]&&i>=12&&i<=15&&t-held[i]>380){held[i]=t-300;press(i)}
      prev[i]=p});
    const dz=.12,cv=v=>{const a=Math.abs(v);if(a<dz)return 0;const k=(a-dz)/(1-dz);return Math.sign(v)*(k*k*.75+k*.25)};
    const y1=cv(g.axes[1]||0);if(y1)scrollBy(y1*30*dt);
    const cz=v=>Math.hypot(g.axes[2]||0,g.axes[3]||0)<.28?0:cv(v);const mx=cz(g.axes[2]||0),my=cz(g.axes[3]||0);if((mx||my)&&on())moveCursor(mx*20*dt,my*20*dt);
    const x=g.axes[0]||0,y0=g.axes[1]||0;// cần trái gạt ngang = như phím trái/phải
    const st=Math.abs(x)>.6?(x>0?15:14):0;if(st&&!ax[0]){ax[0]=1;press(st)}else if(!st)ax[0]=0;
    raf=requestAnimationFrame(tick)}
  function start(){if(!raf&&pads().length)raf=requestAnimationFrame(tick)}
  addEventListener('gamepadconnected',start);addEventListener('gamepaddisconnected',()=>{lastId='';if(!pads().length){toast(L('Đã ngắt tay cầm','Controller disconnected'));legend()}});
  setInterval(start,1500);
  const chip=b=>`<span class="pbtn pb${b}">${BTN[b]||('#'+b)}</span>`;
  function legend(){const want=on()&&cfg().hint!==0&&pads().length&&(ctx()!=='all')&&Date.now()-shown<5000;
    document.body.classList.toggle('padon',!!want);if(!want){if(hint){hint.remove();hint=null}return}
    if(!hint){hint=document.createElement('div');hint.className='padhint';document.body.appendChild(hint)}
    const c=ctx(),m=map(c),seen=new Set(),rows=Object.entries(m).filter(([b,a])=>a&&a!=='none'&&a!=='inherit'&&!seen.has(a)&&seen.add(a)).slice(0,5);
    hint.innerHTML=rows.map(([b,a])=>`<span>${chip(+b)}${esc(ACT[a]?ACT[a][0]:a)}</span>`).join('')}
  setInterval(legend,800);
  function settingsHTML(){const g=pads()[0];
    return `<div class="card"><div class="ot">${L('Tay cầm chơi game','Game controller')}</div>
    <div class="kv"><span>${L('Trạng thái','Status')}</span><b>${g?esc(g.id.replace(/\s*\(.*$/,'').slice(0,40)):L('chưa thấy, cắm vào rồi bấm 1 nút','not found, plug in and press a button')}</b></div>
    <div class="seg" style="margin-top:10px">${[[1,L('Bật','On')],[0,L('Tắt','Off')]].map(([k,l])=>`<button data-pon="${k}" class="${(on()?1:0)===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="tiny" style="margin-top:12px">${L('Bảng nút gợi ý khi học','Button hints while studying')}</div><div class="seg" style="margin-top:6px">${[[1,L('Hiện','Show')],[0,L('Ẩn','Hide')]].map(([k,l])=>`<button data-phi="${k}" class="${(cfg().hint===0?0:1)===k?'on':''}">${l}</button>`).join('')}</div>
    <button class="btn line" id="pmap" style="margin-top:12px">${L('Gán nút','Button mapping')}</button>
    <div class="tiny" style="margin-top:8px">${L('Mặc định giống Contanki: A lật thẻ / Nhớ, B Quên, LB hoàn tác. Cần phải là con trỏ chuột, bấm A hoặc nhấn cần phải để click. Cần trái để cuộn, mũi tên chọn mục, View để thoát.','Defaults follow Contanki: A flip / remembered, B forgot, LB undo. Right stick moves a mouse cursor, A or R3 clicks. Left stick scrolls, D-pad moves, View exits.')}</div></div>`}
  function bindSettings(redraw){
    document.querySelectorAll('[data-pon]').forEach(b=>b.onclick=()=>{S.pad=Object.assign({},cfg(),{on:+b.dataset.pon});save();legend();redraw()});
    document.querySelectorAll('[data-phi]').forEach(b=>b.onclick=()=>{S.pad=Object.assign({},cfg(),{hint:+b.dataset.phi});save();legend();redraw()});
    const m=document.getElementById('pmap');if(m)m.onclick=mapDialog}
  function mapDialog(){let cur='all';const v=document.createElement('div');v.className='veil';document.body.appendChild(v);
    const draw=()=>{const m=map(cur);const used=[...new Set(Object.keys(DEF.all).concat(Object.keys(DEF[cur]||{}),Object.keys(m)))].map(Number).sort((a,b)=>a-b);
      v.innerHTML=`<div class="panel"><div class="row" style="margin-bottom:10px"><div class="grow" style="font-weight:800;font-size:18px">${L('Gán nút tay cầm','Controller buttons')}</div><button class="iconbtn" id="pmx">${I.x}</button></div>
      <div class="seg wrapseg">${CTX.map(([k,l])=>`<button data-pc="${k}" class="${k===cur?'on':''}">${esc(l)}</button>`).join('')}</div>
      <div class="pmrows">${used.map(b=>`<div class="pmrow">${chip(b)}<select data-pb="${b}" class="field">${(cur==='all'?[]:[['inherit',L('Như "Mọi màn"','Same as Everywhere')]]).concat(Object.entries(ACT).map(([k,[l]])=>[k,l])).map(([k,l])=>`<option value="${k}" ${((m[b]===undefined||m[b]==='inherit')?(cur==='all'?k==='none':k==='inherit'):m[b]===k)?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="row wrapbtn" style="margin-top:12px"><button class="btn line" id="padd">${L('Thêm nút: bấm trên tay cầm','Add: press a button')}</button><button class="btn line" id="prst">${L('Về mặc định','Reset')}</button></div></div>`;
      v.querySelector('#pmx').onclick=()=>v.remove();
      v.querySelectorAll('[data-pc]').forEach(b=>b.onclick=()=>{cur=b.dataset.pc;draw()});
      v.querySelectorAll('[data-pb]').forEach(s=>s.onchange=()=>{const P=Object.assign({},cfg());P.b=Object.assign({},P.b||{});P.b[cur]=Object.assign({},P.b[cur]||{});
        P.b[cur][s.dataset.pb]=s.value;S.pad=P;save()});
      v.querySelector('#padd').onclick=e=>{e.target.textContent=L('Đang chờ bạn bấm nút…','Press a button…');cap=b=>{const P=Object.assign({},cfg());P.b=Object.assign({},P.b||{});P.b[cur]=Object.assign({},P.b[cur]||{});if(!(b in map(cur)))P.b[cur][b]=cur==='all'?'none':'inherit';S.pad=P;save();draw()};start()};
      v.querySelector('#prst').onclick=()=>{const P=Object.assign({},cfg());if(P.b)delete P.b[cur];S.pad=P;save();draw()}};
    draw()}
  return {settingsHTML,bindSettings,start}})();

/* ---------- boot ---------- */
(async()=>{
  const c=ls.get('shiratama-code',null);
  if(c){try{DATA=await loadContent(c);indexData()}catch(e){DATA=null}}
  if(DATA)await openBundle(c);
  render();if(DATA)SYNC.start(c);FLYBY.start();
  const it=document.getElementById('intro');if(it){const wait=Math.max(0,1800-(Date.now()-(window.T0||0)));setTimeout(()=>{it.classList.add('out');setTimeout(()=>it.remove(),700)},wait)}
})();
})();
