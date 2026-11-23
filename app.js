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
const examsSorted=()=>DATA.exams.slice().sort((a,b)=>(b.date||'0').localeCompare(a.date||'0'));
const SIZES=[18,20,22,25,28,32,36];

/* ---------- state ---------- */
const KEY='shiratama-v1';
const DEF={v:1,ans:{},cards:{},exams:{},theme:'auto',mode:'auto',size:2,lang:'vi'};
let S=Object.assign(structuredClone(DEF),ls.get(KEY,{}));
if(S.size==null||!S.size2){S.size=3;S.size2=1} if(!S.mode)S.mode='auto'; if(!S.lang)S.lang='vi';
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
  note:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  plus:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  folder:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  upload:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
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
  $$('[data-tab]').forEach(b=>b.onclick=()=>{const k=b.dataset.tab;TAB=k==='home'?(S.lastStudy||'home'):k==='exam'?(S.lastExam||'exam'):k;if(TIP)TIP.style.display='none';render()});
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
   <div class="card"><div class="ot">${L('Cỡ chữ trên thẻ và câu hỏi','Text size on cards and questions')}</div>
    <div class="row"><button class="btn line" id="sm" ${S.size?'':'disabled'}>A−</button><div class="grow center jp" style="font-size:${SIZES[S.size]}px">日本語の勉強</div><button class="btn line" id="sp" ${S.size<SIZES.length-1?'':'disabled'}>A+</button></div>
    <div class="tiny" style="margin-top:8px">${L('Khi đang học có nút A− / A+ ở thanh trên.','While studying use A− / A+ in the top bar.')}</div></div>
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
    $('#slock').onclick=()=>{if(!confirm(L('Khóa app? Lần sau phải nhập lại mã. Tiến độ học vẫn giữ nguyên.','Lock the app? You will need the code again. Progress is kept.')))return;localStorage.removeItem('shiratama-code');DATA=null;render()};
  };
  draw();
}

function render(){
  stopAudio();applyLook();
  if(!DATA)return lockScreen();
  if(SS)return renderSession();
  if(AK)return renderAnki();
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
function examList(){
  const exs=examsSorted();const ex=exs.find(e=>e.id===S.exSel)||exs[0];
  const hist=(S.exams[ex.id]||[]).slice(-5).reverse();
  const due=dueIds().length;
  shell(`${header()}
  <div class="h">${L('Luyện theo phần','Practice by section')}</div>
  <div class="secgrid">${Object.keys(SEC).map(k=>{const qs=allBy(k);const t=qs.filter(q=>S.ans[q.id]).length;return `<button class="sec" data-prac="${k}"><div style="font-weight:800">${secName(k)}</div><div class="tiny" style="margin-top:6px">${t}/${qs.length} ${L('câu đã làm','done')}</div></button>`}).join('')}</div>
  <div class="h">${L('Đề thi thật','Real tests')}</div>
  <div class="exchips">${exs.map(e=>{const n=e.qs.length,d=e.qs.filter(q=>S.ans[q.id]).length;return `<button class="exchip ${e===ex?'on':''}" data-exsel="${esc(e.id)}"><b>${esc(e.short||L('Đề mẫu 2018','Sample 2018'))}</b><small>${d?`${d}/${n}`:L('chưa làm','new')}</small></button>`}).join('')}</div>
  <div class="card"><div style="font-size:19px;font-weight:800">${esc(examTitle(ex))}</div><div class="tiny" style="margin-top:2px">${esc(ex.note?L(ex.note,ex.note):L('Nguồn: jlpt.jp · đáp án chính thức','Source: jlpt.jp · official answers'))}</div></div>
  ${ex.parts.map((p,i)=>{const qs=partQs(ex,p);return `<div class="card"><div style="font-size:17px;font-weight:800">${partName(p)}</div><div class="tiny">${qs.length} ${L('câu','questions')} · ${p.min} ${L('phút','min')}</div>
   <div class="row" style="margin-top:12px"><button class="btn bee" data-ex="${i}">${L('Thi thật','Timed test')}</button><button class="btn line" data-exp="${i}">${L('Luyện từng câu','One by one')}</button></div></div>`}).join('')}
  ${hist.length?`<div class="h">${L('Lần làm gần đây','Recent attempts')}</div><div class="card">${hist.map(h=>`<div class="list-item"><div class="grow"><div>${esc(partName(ex.parts.find(p=>p.name===h.name)||{name:h.name}))}</div><div class="tiny">${new Date(h.at).toLocaleString(L('vi-VN','en-GB'))}</div></div><b>${h.c}/${h.n}</b></div>`).join('')}</div>`:''}
  `);
  $$('[data-exsel]').forEach(b=>b.onclick=()=>{S.exSel=b.dataset.exsel;save();examList()});
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
  const roots=Object.keys(nodes).filter(n=>!n.includes('::')).sort((a,b)=>a.localeCompare(b));
  Object.values(nodes).forEach(n=>n.kids.sort((a,b)=>a.localeCompare(b)));
  return {nodes,roots};
}
function nodeSet(st,tree,name){const s=new Set();const walk=n=>{const x=tree.nodes[n];if(x.id)s.add(x.id);x.kids.forEach(walk)};walk(name);return s}
function retr(c,now){const k=c.card;if(!k.stability||!k.last_review)return 1;const t=Math.max(0,(now-new Date(k.last_review))/864e5);return Math.pow(1+19/81*t/k.stability,-0.5)}
function ankiQueue(cards,deckSet,decks,topName){
  const now=Date.now(),de=dayEnd(),dk=dayKey(),D=daily();
  const byId={};(decks||[]).forEach(d=>byId[d.id]=d);
  const mine=cards.filter(c=>!c.susp&&c.buried!==dk&&(!deckSet||deckSet.has(c.deck)));
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
      <button class="dn" data-study="${esc(name)}">${esc(short)}</button>
      <span class="dc new">${q.fresh.length||''}</span><span class="dc lrn">${q.learn.length||''}</span><span class="dc due">${q.rev.length||''}</span>
      <button class="iconbtn sm" data-opt="${esc(name)}" aria-label="${L('Tùy chọn deck','Deck options')}">${I.dots}</button></div>`;
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
   ${st.cards.length?`<div class="deckhead"><span class="grow">Deck</span><span class="dc new">${L('Mới','New')}</span><span class="dc lrn">${L('Học','Learn')}</span><span class="dc due">${L('Ôn','Due')}</span><span style="width:34px"></span></div>
   <div class="decks">${tree.roots.map(r=>row(r,0)).join('')}</div>`:`<p class="muted small" style="margin:0">${L('Chưa có thẻ nào.','No cards yet.')}</p>`}</div>`;
  const a=$('#ankiAll');if(a)a.onclick=()=>startAnki(null,null);
  const hd=$('#hdog');if(hd){hd.onclick=()=>{dogDo(hd,'hop');sprAct(hd,'talk',1900);SFX.play(Math.random()<.5?'woof':'buzz');const l=DOG_LINES();dogSay(hd,l[Math.floor(Math.random()*l.length)])};
    if(!S.greetDay||S.greetDay!==dayKey()){S.greetDay=dayKey();save();setTimeout(()=>dogSay(hd,nAll?L(`Hôm nay có ${nAll} thẻ đợi anh nè!`,`${nAll} cards are waiting today!`):L('Hôm nay xong hết rồi, giỏi ghê!','All done for today!'),4200),600)}}
  $$('[data-tw]').forEach(b=>b.onclick=()=>{S.collapsed=S.collapsed||{};S.collapsed[b.dataset.tw]=!S.collapsed[b.dataset.tw];save();ankiBox()});
  $$('[data-study]').forEach(b=>b.onclick=()=>startAnki(nodeSet(st,tree,b.dataset.study),b.dataset.study));
  $$('[data-opt]').forEach(b=>b.onclick=()=>deckOptions(b.dataset.opt));
  $('#addC').onclick=()=>addCards();
  $('#goBr').onclick=()=>{TAB='browse';S.lastStudy='browse';save();BR.sel=null;render()};
  $('#newD').onclick=async()=>{const nm=prompt(L('Tên deck mới (dùng :: để làm deck con, ví dụ Grammar+::N3):','New deck name (use :: for subdecks):'));if(!nm||!nm.trim())return;
    if(st.decks.some(d=>d.name===nm.trim())){toast(L('Đã có deck này','Deck exists'));return}await ANKI.put('decks',{id:'d'+Date.now(),name:nm.trim(),at:Date.now(),cfgId:'1'});dropState();ankiBox()};
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
     ${H(L('Bật trong lúc học bằng nút ⋯ ở góc trên. App tự lật thẻ và tự chuyển thẻ theo số giây dưới đây.','Turn on while studying from the ⋯ button.'))}
     <label class="lab">${L('Mặt trước hiện bao nhiêu giây rồi tự lật','Seconds before showing the answer')}<input class="field" id="oaq" type="number" min="1" value="${c.autoQ}"></label>
     <label class="lab">${L('Mặt sau hiện bao nhiêu giây','Seconds to show the answer')}<input class="field" id="oaa" type="number" min="1" value="${c.autoA}"></label>
     <label class="lab">${L('Hết giờ mặt sau mà anh chưa chấm thì','When time runs out')}${opt('oact',c.autoAct,[['again',L('Tính là Quên','Count as Forgot')],['good',L('Tính là Nhớ','Count as Remembered')],['remind',L('Chỉ nhắc, chờ anh chấm','Just remind me')]])}</label></div>
   <div class="osec"><div class="ot">${L('Cách tính lịch ôn','Scheduling')}</div>
     <label class="lab">${L('Muốn nhớ được bao nhiêu phần trăm thẻ','Target memory rate')} <b id="oretv">${Math.round(c.ret*100)}%</b><input type="range" id="oret" min="70" max="99" value="${Math.round(c.ret*100)}"></label>
     ${H(L('Cao hơn thì ôn dày hơn, nhớ chắc hơn nhưng mỗi ngày nhiều thẻ hơn. 90% là mức Anki khuyên dùng.','Higher means more reviews per day but better memory. 90% is the usual choice.'))}
     <label class="lab">${L('Bộ số của thuật toán FSRS (không cần đụng)','FSRS parameters (optional)')}<input class="field" id="ow" value="${esc(c.w)}" placeholder="${L('Để trống là dùng mặc định','Blank = default')}"></label>
     ${H(L('Anki tính lịch ôn bằng thuật toán FSRS. Nếu anh đã có bộ số tối ưu trong Anki thì dán vào đây, không thì để trống.','Paste optimized parameters from Anki if you have them, otherwise leave blank.'))}
     <label class="lab">${L('Lâu nhất bao nhiêu ngày mới ôn một lần','Maximum interval (days)')}<input class="field" id="omax" type="number" min="1" value="${c.maxIvl}"></label>
     ${H(L('Dù thẻ dễ đến đâu cũng không để lâu hơn số ngày này.','Even easy cards come back within this many days.'))}</div>
   <div class="osec"><div class="ot">${L('Deck này','This deck')}</div>
     <label class="lab">${L('Tên deck','Deck name')}<input class="field" id="oname" value="${esc(name)}"></label>
     ${H(L('Dùng :: để làm deck con, ví dụ "FPT::JPD316".','Use :: for subdecks, e.g. "FPT::JPD316".'))}
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
      const nn=q('#oname').value.trim();
      const targets=q('#osub').checked?st.decks.filter(x=>x.name===name||x.name.startsWith(name+'::')):[d];
      targets.forEach(x=>x.cfgId=pid);await ANKI.putMany('decks',targets);
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
   <div class="seg" style="margin-bottom:12px"><button data-am="paste" class="on">${L('Dán nhiều thẻ','Paste many')}</button><button data-am="one">${L('Từng thẻ','One card')}</button></div>
   <label class="lab">Deck<select class="field" id="adeck">${decks.map(d=>`<option value="${esc(d.id)}" ${d.id===def?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
   <div id="apaste"><label class="lab">${L('Dán các dòng Mặt trước⇥Mặt sau (HTML được). Dòng #deck:Tên đổi deck.','Paste lines Front⇥Back (HTML ok). A #deck:Name line picks the deck.')}<textarea class="field mono" id="atxt" rows="8"></textarea></label>
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
     <button class="iconbtn" id="akundo" aria-label="${L('Hoàn tác','Undo')}" ${AK.hist.length?'':'disabled'}>${I.undo}</button>
     <button class="iconbtn ${AK.auto?'on':''}" id="akmenu" aria-label="${L('Tùy chọn','More')}">${I.dots}</button>
     <div class="akpop" id="akpop">
       <button id="akauto" class="${AK.auto?'on':''}">${I.play}<span>${AK.auto?L('Đang tự lướt','Auto advance on'):L('Tự lướt thẻ','Auto advance')}<small>${L(`Mặt trước ${P.autoQ}s, mặt sau ${P.autoA}s, hết giờ thì ${P.autoAct==='good'?'Nhớ':P.autoAct==='remind'?'chỉ nhắc':'Quên'}`,`Front ${P.autoQ}s, back ${P.autoA}s`)}</small></span></button>
       <div class="row"><button id="aksm">A−</button><button id="aksp">A+</button></div>
       <button id="akmu" class="${MUSIC.on?'on':''}">${I.note}<span>${L('Nhạc nền','Music')}</span></button>
       <button id="akedit">${I.pen}<span>${L('Sửa thẻ này','Edit this card')}</span></button>
     </div></div>
   <div class="prog"><i style="width:${tot?Math.round(done/tot*100):0}%"></i><span><b class="a">${AK.a}</b> · <b class="g">${AK.g}</b></span></div>
   <div class="deckwrap" id="akwrap"><div class="stage" id="stage">${dog('buddy'+(AK.dogAct&&Date.now()-AK.dogAct[1]<500?' '+AK.dogAct[0]:''),'akdog')}<div class="fc" id="fc"><div class="face front"><div class="fin">${it.front}</div></div><div class="face back"><div class="fin">${backHTML(it)}</div></div></div><svg class="aring" id="aring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg></div>
     <div class="gradebar"><button class="gb ng" id="gq">← ${L('Quên','Forgot')}</button><div class="tiny" id="akhint">${L('Chạm thẻ để lật','Tap the card to flip')}<span class="desk"> · ${L('phím cách','space')}</span></div><button class="gb ok" id="gn">${L('Nhớ','Remembered')} →</button></div></div>`);
  ANKI.hydrate($('#fc'));
  {const d=$('#akdog'),A=AK.dogAct;if(d&&A&&Date.now()-A[1]<500){const e=(Date.now()-A[1])/1000;d.querySelector('.sf').style.animationDelay=-e+'s';d._s=setTimeout(()=>{d.classList.remove('yay','sad');d.querySelector('.sf').style.animationDelay=''},(A[0]==='yay'?900:1300)-e*1000)}}
  const shown0=Date.now();clearInterval(AK.tmr);if(P.showTimer)AK.tmr=setInterval(()=>{const e=$('#aktm');if(!e)return clearInterval(AK.tmr);e.textContent=fmtTime(Math.min(P.capSec,(Date.now()-shown0)/1000))},1000);
  $('#akq').onclick=()=>{clearInterval(AK.tmr);clearTimeout(AK.at);AK=null;dropState();TAB='home';render()};
  $('#akundo').onclick=()=>{SFX.play('undo');undoAnki()};
  $('#aksm').onclick=e=>{e.stopPropagation();S.size=Math.max(0,S.size-1);save();applyLook()};
  $('#aksp').onclick=e=>{e.stopPropagation();S.size=Math.min(SIZES.length-1,S.size+1);save();applyLook()};
  $('#akmu').onclick=e=>{MUSIC.toggle();e.currentTarget.classList.toggle('on',MUSIC.on)};
  $('#akedit').onclick=e=>{e.stopPropagation();$('#akpop').classList.remove('open');quickEdit(it)};
  $('#akmenu').onclick=e=>{e.stopPropagation();$('#akpop').classList.toggle('open')};
  $('#akpop').onclick=e=>e.stopPropagation();
  document.body.onclick=()=>{const p=$('#akpop');if(p)p.classList.remove('open')};
  $('#akauto').onclick=()=>{AK.auto=!AK.auto;$('#akpop').classList.remove('open');renderAnki()};
  const fc=$('#fc'),stage=$('#stage');
  let busy=false;
  const ring=(sec)=>{const r=$('#aring');if(!r)return;r.classList.remove('run');void r.getBBox();r.style.setProperty('--t',sec+'s');r.classList.add('run')};
  const flip=()=>{AK.show=true;SFX.play('flip');dogDo($('#akdog'),'buzz');fc.classList.add('flip');stage.classList.add('shown');$('#akwrap').classList.add('shown');
    clearTimeout(AK.at);if(AK.auto){ring(P.autoA);AK.at=setTimeout(()=>{if(!AK||AK.list[AK.i]!==it)return;if(P.autoAct==='remind'){SFX.play('tap');dogSay($('#akdog'),L('Anh ơi, chấm thẻ này nè','Time to grade this one'),2500)}else grade(P.autoAct==='good'?3:1)},P.autoA*1000)}};
  clearTimeout(AK.at);if(AK.auto){ring(P.autoQ);AK.at=setTimeout(()=>{if(AK&&AK.list[AK.i]===it&&!AK.show)flip()},P.autoQ*1000)}
  const grade=async(g)=>{if(busy)return;busy=true;clearTimeout(AK.at);glow(stage,g===3);SFX.play(g===3?'ok':'ng');clearInterval(AK.tmr);dogDo($('#akdog'),g===3?'hop':'tilt');sprAct($('#akdog'),g===3?'yay':'sad',g===3?900:1300);AK.dogAct=[g===3?'yay':'sad',Date.now()];fc.style.transform='';fc.classList.add(g===3?'fly-r':'fly-l');
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
    else if(e.key==='ArrowRight'||e.key==='2'||e.key==='3'||e.key==='4'||e.key===' '||e.key==='Enter'){e.preventDefault();grade(3)}
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
document.addEventListener('keydown',e=>{if(AK&&AK.key)AK.key(e)});

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
    if(r){dropState();setTimeout(()=>toast(L(`Đã nạp ${r.cards} thẻ cùng lịch sử học`,`Loaded ${r.cards} cards with history`)),300)}}
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
  async function once(){
    const t0=Date.now();
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
    if(metaDirty){const decks=(await raw.all('decks')).map(d=>({id:d.id,name:d.name,cfgId:d.cfgId||'1',at:d.at||0}));
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
    ['put','putMany','del','delDeck','all'].forEach(k=>raw[k]=ANKI[k]);
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
  return {start,run,chip:()=>!FB?'':`<button class="syncchip ${st.state}" data-sync>${chipInner()}</button>`,detail:()=>`<div id="sysync">${detail()}</div>`,get state(){return st},get on(){return !!FB}};
})();

/* ---------- boot ---------- */
(async()=>{
  const c=ls.get('shiratama-code',null);
  if(c){try{DATA=await loadContent(c);indexData()}catch(e){DATA=null}}
  if(DATA)await openBundle(c);
  render();if(DATA)SYNC.start(c);FLYBY.start();
  const it=document.getElementById('intro');if(it){const wait=Math.max(0,1800-(Date.now()-(window.T0||0)));setTimeout(()=>{it.classList.add('out');setTimeout(()=>it.remove(),700)},wait)}
})();
})();
