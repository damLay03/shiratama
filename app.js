/* shiratama — luyện đề JLPT có giải thích + ôn câu sai bằng FSRS.
   Nội dung đề được mã hóa (AES-GCM) trong data/*.enc; chỉ mở được khi nhập đúng mã. */
(function(){
'use strict';
const APP='shiratama', MARK='白玉';
const EXAM_DAY=new Date('2026-12-06T09:00:00+09:00');
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rich=s=>esc(s).replace(/&lt;u&gt;/g,'<u>').replace(/&lt;\/u&gt;/g,'</u>');
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const NUM='１２３４';
const SEC={moji:'文字・語彙',bunpou:'文法',dokkai:'読解',choukai:'聴解'};
const SEC_VI={moji:'Chữ Hán & từ vựng',bunpou:'Ngữ pháp',dokkai:'Đọc hiểu',choukai:'Nghe hiểu'};
const SEC_SEC={moji:50,bunpou:60,dokkai:150,choukai:0};

/* ---------- state ---------- */
const KEY='shiratama-v1';
const DEF={v:1,ans:{},cards:{},exams:{},theme:'auto'};
let S=Object.assign(structuredClone(DEF),ls.get(KEY,{}));
const save=()=>ls.set(KEY,S);
let DATA=null; // {exams:[...]}
let QI={};     // id -> {q, exam}
let SS=null;   // current session
let TAB='home';

/* ---------- FSRS ---------- */
const hasF=typeof FSRS!=='undefined';
const F=hasF?FSRS.fsrs(FSRS.generatorParameters({request_retention:0.9,maximum_interval:180,enable_fuzz:true})):null;
function revive(c){const o=Object.assign({},c);o.due=new Date(c.due);if(c.last_review)o.last_review=new Date(c.last_review);return o}
function rate(id,grade){ // grade: 1 again, 2 hard, 3 good
  if(!hasF)return;
  const now=new Date();
  const cur=S.cards[id]?revive(S.cards[id]):FSRS.createEmptyCard(now);
  const next=F.repeat(cur,now)[grade].card;
  S.cards[id]=next;
}
function dueIds(){const now=Date.now();return Object.keys(S.cards).filter(id=>QI[id]&&new Date(S.cards[id].due).getTime()<=now)}

/* ---------- theme ---------- */
function applyTheme(){const r=document.documentElement;if(S.theme==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',S.theme)}
applyTheme();

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
function record(q,ok,mode,ms){(S.ans[q.id]=S.ans[q.id]||[]).push({t:Date.now(),ok:ok?1:0,m:mode,ms:ms|0});}
function lastOk(id){const a=S.ans[id];return a&&a.length?a[a.length-1].ok:null}
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
function fmtTime(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function daysLeft(){return Math.ceil((EXAM_DAY-Date.now())/864e5)}
function passageHTML(ex,q){
  if(!q.p)return '';const p=ex.passages[q.p];if(!p)return '';
  let t=esc(p.text).replace(/【(.+?)】/g,'<mark>$1</mark>');
  if(q.sec==='bunpou'){const n=q.q.replace(/[［］]/g,'');t=t.replace(new RegExp('［'+n+'］'),'<mark>［'+n+'］</mark>')}
  return `<div class="passage"><span class="ttl">${esc(p.title||'')}</span>${p.intro?`<span class="muted">${esc(p.intro)}</span>\n\n`:''}${t}</div>`;
}

/* ---------- audio ---------- */
let AU=null,AUQ=null,AUTick=null;
function stopAudio(){if(AU){AU.pause()}clearInterval(AUTick);AUQ=null;const b=$('#aubtn');if(b)b.innerHTML=playIcon}
const playIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
const pauseIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
function playSeg(q,restart){
  if(!AU){AU=new Audio();AU.preload='auto'}
  const [a,b]=q.t;
  const go=()=>{if(restart||AU.currentTime<a||AU.currentTime>=b-0.2)AU.currentTime=a;AU.play().catch(()=>toast('Không phát được âm thanh'));};
  if(AU.dataset.src!==q.audio){AU.src=q.audio;AU.dataset.src=q.audio;AU.addEventListener('loadedmetadata',go,{once:true});AU.load()}else go();
  AUQ=q.id;$('#aubtn').innerHTML=pauseIcon;
  clearInterval(AUTick);AUTick=setInterval(()=>{
    const tr=$('#autrack');if(tr)tr.style.width=Math.min(100,Math.max(0,(AU.currentTime-a)/(b-a)*100))+'%';
    const tt=$('#autime');if(tt)tt.textContent=fmtTime(AU.currentTime-a)+' / '+fmtTime(b-a);
    if(AU.currentTime>=b){AU.pause();stopAudio()}
  },200);
}
function audioHTML(q){return `<div class="audio"><button id="aubtn" aria-label="Phát">${playIcon}</button><div class="track"><i id="autrack"></i></div><span class="tiny" id="autime">0:00 / ${fmtTime(q.t[1]-q.t[0])}</span><button id="aurestart" aria-label="Nghe lại" style="width:36px;height:36px;background:none;color:var(--ai)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg></button></div>`}
function bindAudio(q){const b=$('#aubtn');if(!b)return;b.onclick=()=>{if(AUQ===q.id&&!AU.paused){AU.pause();b.innerHTML=playIcon}else playSeg(q)};$('#aurestart').onclick=()=>playSeg(q,true)}

/* ---------- render shell ---------- */
function shell(inner,{tabs=true}={}){
  $('#app').innerHTML=`<div class="wrap">${inner}</div>`+(tabs?`<nav class="tabs">
   ${[['home','今','Hôm nay'],['exam','試','Đề thi'],['review','復','Ôn tập'],['stats','析','Điểm yếu']].map(([k,j,v])=>`<button data-tab="${k}" class="${TAB===k?'on':''}"><b>${j}</b>${v}</button>`).join('')}</nav>`:'');
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{TAB=b.dataset.tab;render()});
  window.scrollTo(0,0);
}
function header(){return `<div class="top"><div class="brand"><img class="mark" src="img/mark.webp" alt="">${APP}</div><button class="ghost" id="themeBtn">${S.theme==='dark'?'Tối':S.theme==='light'?'Sáng':'Tự động'}</button></div>`}
function bindHeader(){const b=$('#themeBtn');if(b)b.onclick=()=>{S.theme=S.theme==='auto'?'dark':S.theme==='dark'?'light':'auto';save();applyTheme();render()}}

function render(){
  stopAudio();
  if(!DATA)return lockScreen();
  if(SS)return renderSession();
  if(AK)return renderAnki();
  ({home,exam:examList,review:reviewHome,stats}[TAB]||home)();
  bindHeader();
}

/* ---------- lock ---------- */
function lockScreen(err){
  shell(`${header()}<div class="card"><p class="jp" style="font-size:20px;margin:0 0 6px">ようこそ。</p><p class="muted small" style="margin:0 0 16px">Nhập mã để mở bộ đề. Mã chỉ cần nhập một lần trên mỗi máy.</p>
  <input class="field" id="code" placeholder="Mã của anh" autocomplete="off" autocapitalize="off" spellcheck="false">
  ${err?`<p class="small" style="color:var(--shu)">${esc(err)}</p>`:''}
  <div style="margin-top:14px"><button class="btn shu" id="open" style="width:100%">Mở</button></div></div>`,{tabs:false});
  bindHeader();
  const go=async()=>{const c=$('#code').value;if(!c)return;$('#open').disabled=true;$('#open').textContent='Đang mở…';
    try{DATA=await loadContent(c);ls.set('shiratama-code',c);indexData();render()}catch(e){lockScreen('Mã không đúng, hoặc chưa tải được đề.')}};
  $('#open').onclick=go;$('#code').onkeydown=e=>{if(e.key==='Enter')go()};
}

/* ---------- home ---------- */
function home(){
  const due=dueIds().length, total=Object.keys(S.ans).length, allQ=Object.keys(QI).length;
  const tried=Object.keys(S.ans).filter(id=>QI[id]);
  const okN=tried.filter(id=>lastOk(id)).length;
  const dl=daysLeft();
  const ex=DATA.exams[0];
  shell(`${header()}
  <div class="card"><div class="tiny">JLPT N3 · Chủ nhật 6/12/2026</div>
   <div class="countdown"><span class="big">${dl>0?dl:0}</span><span class="muted">ngày nữa</span></div></div>
  <div class="grid2">
   <div class="card stat"><div class="tiny">Câu sai đến hạn ôn</div><div class="big" style="color:${due?'var(--shu)':'inherit'}">${due}</div>
     <button class="btn ${due?'shu':'line'}" id="goRev" style="margin-top:10px;width:100%" ${due?'':'disabled'}>Ôn ngay</button></div>
   <div class="card stat"><div class="tiny">Đã làm</div><div class="big">${tried.length}<span class="muted" style="font-size:16px"> / ${allQ}</span></div>
     <div class="tiny" style="margin-top:14px">Đúng ở lần gần nhất: ${tried.length?Math.round(okN/tried.length*100):0}%</div></div>
  </div>
  <div class="h">Luyện nhanh theo phần</div>
  <div class="card">${Object.keys(SEC).map(k=>{const qs=allBy(k);const t=qs.filter(q=>S.ans[q.id]).length;return `<div class="list-item"><div class="grow"><div class="jp" style="font-size:17px">${SEC[k]}</div><div class="tiny">${SEC_VI[k]} · ${t}/${qs.length} câu đã làm</div></div><button class="btn line" data-prac="${k}">Luyện</button></div>`}).join('')}</div>
  <div class="h">Đề thi thật</div>
  <div class="card"><div class="jp" style="font-size:17px">${esc(ex.title)}</div><div class="tiny" style="margin:4px 0 12px">${ex.qs.length} câu · có bấm giờ như thi thật</div><button class="btn" id="goExam">Xem đề</button></div>`);
  $('#goRev').onclick=()=>startReview();
  $('#goExam').onclick=()=>{TAB='exam';render()};
  document.querySelectorAll('[data-prac]').forEach(b=>b.onclick=()=>startPractice(b.dataset.prac));
}
function allBy(sec){return Object.values(QI).map(x=>x.q).filter(q=>q.sec===sec)}

/* ---------- exam list ---------- */
function examList(){
  const ex=DATA.exams[0];
  const hist=(S.exams[ex.id]||[]).slice(-5).reverse();
  shell(`${header()}
  <div class="card"><div class="jp" style="font-size:19px;font-weight:700">${esc(ex.title)}</div><div class="tiny" style="margin-top:4px">${esc(ex.src)}</div></div>
  ${ex.parts.map((p,i)=>{const qs=partQs(ex,p);return `<div class="card"><div class="row"><div class="grow"><div class="jp" style="font-size:17px">${esc(p.name)}</div><div class="tiny">${qs.length} câu · ${p.min} phút</div></div></div>
   <div class="row" style="margin-top:12px"><button class="btn shu" data-ex="${i}">Thi thật (bấm giờ)</button><button class="btn line" data-exp="${i}">Luyện từng câu</button></div></div>`}).join('')}
  ${hist.length?`<div class="h">Lần làm gần đây</div><div class="card">${hist.map(h=>`<div class="list-item"><div class="grow"><div>${esc(h.name)}</div><div class="tiny">${new Date(h.at).toLocaleString('vi-VN')}</div></div><b>${h.c}/${h.n}</b></div>`).join('')}</div>`:''}
  <p class="tiny center">Đáp án theo bản chính thức của JLPT. Âm thanh phát trực tiếp từ jlpt.jp.</p>`);
  document.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>startExam(ex,ex.parts[+b.dataset.ex],true));
  document.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>startExam(ex,ex.parts[+b.dataset.exp],false));
}
function partQs(ex,p){const keys=p.key.split('+');return ex.qs.filter(q=>keys.includes(q.sec))}

/* ---------- sessions ---------- */
function startExam(ex,part,timed){
  const qs=partQs(ex,part);
  SS={kind:timed?'exam':'practice',title:part.name,ex,qs,i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now(),deadline:timed?Date.now()+part.min*60000:0,part};
  render();
}
function startPractice(sec,n=10){
  const qs=allBy(sec);
  // ưu tiên câu chưa làm và câu sai gần nhất
  const score=q=>{const lo=lastOk(q.id);return lo===null?0:lo===0?1:2};
  const pick=shuffle(qs).sort((a,b)=>score(a)-score(b)).slice(0,n);
  // giữ câu cùng bài đọc đi liền nhau
  pick.sort((a,b)=>(a.p||'').localeCompare(b.p||'')||a.no-b.no);
  SS={kind:'practice',title:SEC[sec],qs:pick,i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now()};
  render();
}
function startReview(){
  const ids=shuffle(dueIds());if(!ids.length){toast('Chưa có câu nào đến hạn');return}
  SS={kind:'review',title:'Ôn câu sai',qs:ids.map(id=>QI[id].q),i:0,picks:{},shown:{},t0:Date.now(),qt:Date.now()};
  render();
}
let TIMER=null;
function renderSession(){
  clearInterval(TIMER);
  const q=SS.qs[SS.i], ex=QI[q.id].ex, exam=SS.kind==='exam';
  const pick=SS.picks[q.id], shown=SS.shown[q.id];
    const head=`<div class="qhead"><button class="ghost" id="quit">✕ Thoát</button><span>${esc(SS.title)} · ${SS.i+1}/${SS.qs.length}</span>${exam?`<span class="timer" id="timer"></span>`:'<span></span>'}</div>
   <div class="bar"><i style="width:${(SS.i+1)/SS.qs.length*100}%"></i></div>`;
  const stemQ=q.sec==='choukai'&&!shown&&(exam||q.m>=3)?`<div class="stem muted" style="font-size:15px">（Nghe audio để biết câu hỏi）</div>`:`<div class="stem">${rich(q.q)}</div>`;
  const opts=q.o.map((o,k)=>{
    let cls='opt';
    if(shown){if(k===q.a)cls+=' right';else if(k===pick)cls+=' wrong'}
    else if(k===pick)cls+=' sel';
    const label=q.hideOpts&&!shown?'':esc(o);
    return `<button class="${cls}" data-k="${k}" ${shown?'disabled':''}><span class="n">${k+1}</span><span>${label||'<span class="tiny">(nghe đáp án trong audio)</span>'}</span></button>`}).join('');
  const pic=q.pic?`<div class="tiny" style="margin:-6px 0 12px">Tranh: ${esc(q.pic)}</div>`:'';
  let exp='';
  if(shown){
    const ok=pick===q.a;
    exp=`<div class="explain"><div class="verdict ${ok?'ok':'ng'}">${pick==null?'Chưa chọn':ok?'Đúng':'Sai'} · đáp án ${q.a+1}</div>
      <p class="why">${esc(q.why)}</p>
      ${q.w.map((w,k)=>w?`<div class="w"><b>${k+1}</b><span>${esc(w)}</span></div>`:'').join('')}
      ${q.script?`<details ${ok?'':'open'}><summary>Lời thoại</summary><div class="script">${esc(q.script)}</div></details>`:''}
      <div class="tiny" style="margin-top:10px">${esc(q.type)} · ${esc(q.tag||'')}</div></div>`;
  }
  const sheet=exam?`<div class="h">Phiếu trả lời</div><div class="sheet">${SS.qs.map((x,k)=>`<button data-go="${k}" class="${SS.picks[x.id]!=null?'done':''} ${k===SS.i?'cur':''}">${k+1}</button>`).join('')}</div>`:'';
  const last=SS.i===SS.qs.length-1;
  const nav=exam
    ?`<div class="navq"><button class="btn line" id="prev" ${SS.i?'':'disabled'}>Câu trước</button>${last?`<button class="btn shu" id="submit">Nộp bài</button>`:`<button class="btn" id="next">Câu sau</button>`}</div>`
    :shown?`<div class="navq">${pick===q.a&&SS.kind!=='review'?'':''}<button class="btn" id="next">${last?'Xem kết quả':'Câu tiếp'}</button></div>${pick===q.a?`<div class="center"><button class="guess" id="guess">Mình đoán mò câu này → đưa vào ôn lại</button></div>`:''}`
    :`<div class="navq"><button class="btn" id="check" ${pick==null?'disabled':''}>Kiểm tra</button></div>`;
  shell(`${head}${passageHTML(ex,q)}${q.audio?audioHTML(q):''}<div><span class="mtag">問題${q.m}</span><span class="tiny">${esc(q.type)}</span></div>${stemQ}${pic}<div class="opts">${opts}</div>${exp}${nav}${sheet}`,{tabs:false});
  bindAudio(q);
  if(q.audio&&!shown&&SS.kind==='exam'&&SS.autoplayed!==q.id){SS.autoplayed=q.id;setTimeout(()=>playSeg(q,true),300)}
  $('#quit').onclick=()=>{if(SS.kind==='exam'&&!confirmQuit())return;SS=null;clearInterval(TIMER);render()};
  document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{if(shown)return;SS.picks[q.id]=+b.dataset.k;
    if(exam||true){const keep=window.scrollY;renderSession();window.scrollTo(0,keep)}});
  const nx=$('#next');if(nx)nx.onclick=()=>{if(!exam&&last)return finish();SS.i++;SS.qt=Date.now();renderSession()};
  const pv=$('#prev');if(pv)pv.onclick=()=>{SS.i--;renderSession()};
  const ck=$('#check');if(ck)ck.onclick=()=>check(q);
  const gs=$('#guess');if(gs)gs.onclick=()=>{rate(q.id,1);S.ans[q.id][S.ans[q.id].length-1].g=1;save();toast('Đã đưa vào sổ ôn');gs.remove()};
  const sb=$('#submit');if(sb)sb.onclick=()=>{const left=SS.qs.filter(x=>SS.picks[x.id]==null).length;if(left&&!window.confirm(`Còn ${left} câu chưa chọn. Nộp bài?`))return;finish()};
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{SS.i=+b.dataset.go;renderSession()});
  if(exam){const tick=()=>{const left=(SS.deadline-Date.now())/1000;const el=$('#timer');if(el){el.textContent=fmtTime(left);el.classList.toggle('warn',left<300)}if(left<=0){clearInterval(TIMER);toast('Hết giờ');finish()}};tick();TIMER=setInterval(tick,1000)}
}
function confirmQuit(){return window.confirm('Thoát bài thi? Các câu đã chọn sẽ không được chấm.')}
function check(q){
  const pick=SS.picks[q.id];SS.shown[q.id]=1;stopAudio();
  const ok=pick===q.a;record(q,ok,SS.kind,Date.now()-SS.qt);
  if(SS.kind==='review')rate(q.id,ok?3:1);
  else if(!ok)rate(q.id,1);
  else if(S.cards[q.id])rate(q.id,3);
  save();const keep=window.scrollY;renderSession();
  const e=document.querySelector('.explain');if(e)e.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function finish(){
  clearInterval(TIMER);stopAudio();
  const s=SS;
  if(s.kind==='exam'){
    s.qs.forEach(q=>{const ok=s.picks[q.id]===q.a;record(q,ok,'exam',0);if(!ok)rate(q.id,1);else if(S.cards[q.id])rate(q.id,3)});
    const c=s.qs.filter(q=>s.picks[q.id]===q.a).length;
    (S.exams[s.ex.id]=S.exams[s.ex.id]||[]).push({at:Date.now(),name:s.part.name,c,n:s.qs.length,secs:Math.round((Date.now()-s.t0)/1000)});
    save();
  }
  s.qs.forEach(q=>s.shown[q.id]=1);
  SS=null;resultScreen(s);
}
function resultScreen(s){
  const c=s.qs.filter(q=>s.picks[q.id]===q.a).length, n=s.qs.length;
  const byM={};s.qs.forEach(q=>{const k='問題'+q.m+' '+q.type;const o=byM[k]=byM[k]||{c:0,n:0,sec:q.sec};o.n++;if(s.picks[q.id]===q.a)o.c++});
  shell(`<div class="qhead"><button class="ghost" id="back">← Về trang chính</button><span>${esc(s.title)}</span><span></span></div>
   <div class="card center"><div class="tiny">Kết quả</div><div class="big" style="font-size:48px">${c}<span class="muted" style="font-size:22px"> / ${n}</span></div><div class="muted small">${Math.round(c/n*100)}% · ${fmtTime((Date.now()-s.t0)/1000)} phút</div></div>
   <div class="h">Theo dạng câu</div><div class="card">${Object.entries(byM).map(([k,o])=>`<div class="list-item"><div class="grow jp">${esc(k)}</div><div class="meter ${o.c/o.n<.6?'low':''}" style="max-width:120px"><i style="width:${o.c/o.n*100}%"></i></div><b style="min-width:44px;text-align:right">${o.c}/${o.n}</b></div>`).join('')}</div>
   <div class="h">Xem lại từng câu</div><div class="card">${s.qs.map((q,k)=>{const ok=s.picks[q.id]===q.a;return `<div class="list-item" data-rv="${k}" style="cursor:pointer"><span class="pill" style="color:${ok?'var(--ok)':'var(--shu)'}">${ok?'○':'×'}</span><div class="grow jp" style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q.q.replace(/<\/?u>/g,'').replace(/\n/g,' '))}</div><span class="tiny">${s.picks[q.id]!=null?s.picks[q.id]+1:'–'} → ${q.a+1}</span></div>`}).join('')}</div>
   <p class="tiny center">Câu sai đã được đưa vào sổ ôn (FSRS).</p>`,{tabs:false});
  $('#back').onclick=()=>{TAB='home';render()};
  document.querySelectorAll('[data-rv]').forEach(b=>b.onclick=()=>{SS=Object.assign({},s,{kind:'view',i:+b.dataset.rv,back:s});renderView()});
}
function renderView(){ // xem lại một câu sau khi nộp bài
  const s=SS;const q=s.qs[s.i];const ex=QI[q.id].ex;
  s.kind='practice';s.shown[q.id]=1;renderSession();
  const nav=document.querySelector('.navq');if(nav)nav.innerHTML=`<button class="btn line" id="rvb">← Kết quả</button>${s.i<s.qs.length-1?'<button class="btn" id="rvn">Câu sau</button>':''}`;
  $('#rvb').onclick=()=>{const b=s.back;SS=null;resultScreen(b)};
  const n=$('#rvn');if(n)n.onclick=()=>{s.i++;renderView()};
  $('#quit').onclick=()=>{const b=s.back;SS=null;resultScreen(b)};
  const g=$('#guess');if(g)g.remove();
}

/* ---------- review home ---------- */
function reviewHome(){
  const ids=Object.keys(S.cards).filter(id=>QI[id]);
  const due=dueIds();
  const soon=ids.map(id=>({id,due:new Date(S.cards[id].due)})).sort((a,b)=>a.due-b.due);
  shell(`${header()}
  <div class="card"><div class="tiny">Sổ câu sai</div><div class="row" style="margin-top:4px"><div class="big grow">${due.length}<span class="muted" style="font-size:16px"> câu đến hạn / ${ids.length} câu trong sổ</span></div></div>
  <button class="btn shu" id="go" style="margin-top:12px;width:100%" ${due.length?'':'disabled'}>Ôn ${due.length} câu</button>
  <p class="tiny" style="margin:10px 0 0">Câu làm sai hoặc đoán mò sẽ vào đây. Lịch ôn theo FSRS: nhớ chắc thì giãn ra, quên thì quay lại sớm.</p></div>
  ${soon.length?`<div class="h">Lịch sắp tới</div><div class="card">${soon.slice(0,30).map(x=>{const q=QI[x.id].q;const d=Math.round((x.due-Date.now())/864e5);return `<div class="list-item"><span class="pill">${SEC[q.sec]}</span><div class="grow jp" style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q.q.replace(/<\/?u>/g,'').replace(/\n/g,' '))}</div><span class="tiny">${d<=0?'hôm nay':d+' ngày'}</span></div>`}).join('')}</div>`:`<div class="empty">Chưa có câu sai nào. Làm một đề để bắt đầu.</div>`}
  <div class="h">Thẻ Anki</div><div class="card" id="ankiBox"><div class="tiny">Đang đọc…</div></div>`);
  $('#go').onclick=()=>startReview();
  ankiBox();
}

/* ---------- Anki ---------- */
if(S.newPerDay==null)S.newPerDay=20;
function nl(){const k=new Date().toDateString();if(!S.ankiDay||S.ankiDay.d!==k)S.ankiDay={d:k,n:0,r:0};return S.ankiDay}
async function ankiState(){
  if(!window.ANKI)return {decks:[],cards:[]};
  const [decks,cards]=await Promise.all([ANKI.all('decks'),ANKI.all('cards')]);
  return {decks,cards};
}
function ankiQueue(cards,deck){
  const now=Date.now();const day=nl();
  const mine=cards.filter(c=>!c.susp&&(!deck||c.deck===deck));
  const due=mine.filter(c=>c.card.state!==0&&new Date(c.card.due).getTime()<=now+ (c.card.state===2?0:0)).sort((a,b)=>new Date(a.card.due)-new Date(b.card.due));
  const fresh=mine.filter(c=>c.card.state===0).slice(0,Math.max(0,S.newPerDay-day.n));
  return {due,fresh};
}
async function ankiBox(){
  const box=$('#ankiBox');if(!box)return;
  let st;try{st=await ankiState()}catch(e){box.innerHTML='<div class="muted small">Trình duyệt chặn bộ nhớ, chưa dùng được phần thẻ.</div>';return}
  const rows=st.decks.map(d=>{const q=ankiQueue(st.cards,d.id);const n=st.cards.filter(c=>c.deck===d.id).length;return {d,q,n}}).filter(r=>r.n);
  const tot=ankiQueue(st.cards);
  box.innerHTML=`${rows.length?`<div class="row" style="margin-bottom:6px"><div class="grow"><div class="big">${tot.due.length}<span class="muted" style="font-size:15px"> thẻ đến hạn · ${tot.fresh.length} thẻ mới</span></div></div></div>
   <button class="btn shu" id="ankiAll" style="width:100%;margin:8px 0 6px" ${tot.due.length+tot.fresh.length?'':'disabled'}>Ôn tất cả</button>
   ${rows.map(r=>`<div class="list-item"><div class="grow"><div class="jp" style="font-size:15px">${esc(r.d.name)}</div><div class="tiny">${r.n} thẻ · <span style="color:var(--shu)">${r.q.due.length} đến hạn</span> · ${r.q.fresh.length} mới</div></div><button class="btn line" data-deck="${esc(r.d.id)}" ${r.q.due.length+r.q.fresh.length?'':'disabled'}>Ôn</button><button class="ghost" data-del="${esc(r.d.id)}" aria-label="Xóa deck">✕</button></div>`).join('')}`
   :`<p class="muted small" style="margin:0 0 10px">Nhập file .apkg xuất từ Anki (nhớ tích "Include scheduling information"). Lịch ôn và độ nhớ của từng thẻ được giữ nguyên.</p>`}
   <div class="row" style="margin-top:10px"><button class="btn line" id="ankiImp">Nhập file .apkg</button><span class="grow"></span><label class="tiny">Thẻ mới/ngày <input type="number" id="npd" value="${S.newPerDay}" min="0" max="999" style="width:56px;font:inherit;padding:4px;border:1px solid var(--line2);border-radius:6px;background:var(--card);color:var(--ink)"></label></div>
   <div class="tiny" id="impMsg" style="margin-top:8px"></div>`;
  const a=$('#ankiAll');if(a)a.onclick=()=>startAnki(null,st);
  document.querySelectorAll('[data-deck]').forEach(b=>b.onclick=()=>startAnki(b.dataset.deck,st));
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Xóa deck này khỏi app? File Anki gốc của anh không bị ảnh hưởng.'))return;await ANKI.delDeck(b.dataset.del);ankiBox()});
  $('#npd').onchange=e=>{S.newPerDay=Math.max(0,+e.target.value|0);save();ankiBox()};
  $('#ankiImp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.apkg,.colpkg';i.onchange=async()=>{const msg=$('#impMsg');
    try{const r=await ANKI.importApkg(i.files[0],t=>msg.textContent=t);msg.textContent=`Đã nhập ${r.cards} thẻ từ ${r.decks} deck. ${r.fsrsN} thẻ giữ nguyên độ nhớ FSRS từ Anki, ${r.replay} thẻ dựng lại từ lịch sử ôn${r.media?`, ${r.media} ảnh`:''}.${r.skipped?` Bỏ qua ${r.skipped} thẻ dư (dsdshdids).`:''}${r.kept?` ${r.kept} thẻ giữ lịch đã ôn trong app.`:''}`;setTimeout(ankiBox,2500)}
    catch(e){msg.textContent='Không nhập được: '+e.message}};i.click()};
}
let AK=null;
function startAnki(deck,st){
  const q=ankiQueue(st.cards,deck);
  // xen thẻ mới vào giữa thẻ ôn
  const list=[];const d=q.due.slice(),f=q.fresh.slice();while(d.length||f.length){for(let k=0;k<4&&d.length;k++)list.push(d.shift());if(f.length)list.push(f.shift())}
  if(!list.length){toast('Không còn thẻ nào hôm nay');return}
  AK={list,i:0,show:false,done:0,deck};renderAnki();
}
function ivlText(dt){const m=(dt-Date.now())/60000;if(m<60)return Math.max(1,Math.round(m))+' phút';if(m<1440)return Math.round(m/60)+' giờ';const dd=m/1440;if(dd<30)return Math.round(dd)+' ngày';if(dd<365)return (dd/30).toFixed(1).replace('.0','')+' tháng';return (dd/365).toFixed(1).replace('.0','')+' năm'}
function reviveA(c){const o=Object.assign({},c);o.due=new Date(c.due);if(c.last_review)o.last_review=new Date(c.last_review);return o}
function renderAnki(){
  const it=AK.list[AK.i];
  if(!it){$('#app').innerHTML=`<div class="wrap"><div class="card center" style="margin-top:40px"><div class="jp" style="font-size:22px">おつかれさま。</div><p class="muted">Xong ${AK.done} thẻ cho hôm nay.</p><button class="btn" id="akb">Về</button></div></div>`;$('#akb').onclick=()=>{AK=null;TAB='review';render()};return}
  const now=new Date();const rec=hasF?F.repeat(reviveA(it.card),now):null;
  shell(`<div class="qhead"><button class="ghost" id="akq">✕ Dừng</button><span>Còn ${AK.list.length-AK.i} thẻ</span><span class="pill">${it.card.state===0?'Mới':it.card.state===2?'Ôn':'Đang học'}</span></div>
   <div class="card ankicard jp" id="akc" style="min-height:44vh;font-size:19px;line-height:1.8;text-align:center">${AK.show?it.back:it.front}</div>
   ${AK.show&&rec?`<div class="grid4">${[[1,'Quên','shu'],[2,'Khó','line'],[3,'Nhớ','ok'],[4,'Dễ','line']].map(([r,l,c])=>`<button class="btn ${c==='shu'?'shu':c==='ok'?'':'line'}" data-r="${r}"><div>${l}</div><div class="tiny" style="color:inherit;opacity:.8">${ivlText(rec[r].card.due)}</div></button>`).join('')}</div>`
   :`<button class="btn" id="akshow" style="width:100%">Xem mặt sau</button>`}`,{tabs:false});
  ANKI.hydrate($('#akc'));
  $('#akq').onclick=()=>{AK=null;TAB='review';render()};
  const sh=$('#akshow');if(sh)sh.onclick=()=>{AK.show=true;renderAnki()};
  document.querySelectorAll('[data-r]').forEach(b=>b.onclick=async()=>{
    const r=+b.dataset.r;const wasNew=it.card.state===0;it.card=rec[r].card;it.appAt=Date.now();await ANKI.put('cards',it);
    const day=nl();if(wasNew)day.n++;day.r++;save();AK.done++;
    // thẻ quên hoặc đang học mà đến hạn trong 20 phút thì quay lại cuối hàng
    if(new Date(it.card.due)-Date.now()<20*60000)AK.list.push(it);
    AK.i++;AK.show=false;renderAnki()});
}
document.addEventListener('keydown',e=>{if(!AK)return;if(e.key===' '&&!AK.show){e.preventDefault();AK.show=true;renderAnki()}else if(AK.show&&/^[1-4]$/.test(e.key)){const b=document.querySelector(`[data-r="${e.key}"]`);if(b)b.click()}});

/* ---------- stats ---------- */
function stats(){
  const rows={};const tags={};
  Object.entries(S.ans).forEach(([id,a])=>{const x=QI[id];if(!x)return;const q=x.q;
    const k=SEC[q.sec]+' · 問題'+q.m+' '+q.type;const r=rows[k]=rows[k]||{c:0,n:0,o:q.no};
    a.forEach(e=>{r.n++;if(e.ok&&!e.g)r.c++});
    const l=a[a.length-1];if(!l.ok||l.g){tags[q.tag]=tags[q.tag]||[];tags[q.tag].push(q)}});
  const list=Object.entries(rows).sort((a,b)=>a[1].o-b[1].o);
  const weak=Object.entries(rows).filter(([k,r])=>r.n>=2).sort((a,b)=>a[1].c/a[1].n-b[1].c/b[1].n).slice(0,3);
  shell(`${header()}
  ${weak.length?`<div class="card"><div class="tiny">Yếu nhất hiện tại</div>${weak.map(([k,r])=>`<div class="jp" style="font-size:16px;margin-top:6px">${esc(k)} <span class="muted small">${Math.round(r.c/r.n*100)}%</span></div>`).join('')}</div>`:''}
  <div class="h">Tỉ lệ đúng theo dạng câu</div>
  <div class="card">${list.length?list.map(([k,r])=>`<div class="list-item"><div class="grow jp" style="font-size:15px">${esc(k)}</div><div class="meter ${r.c/r.n<.6?'low':''}" style="max-width:110px"><i style="width:${r.c/r.n*100}%"></i></div><b style="min-width:52px;text-align:right">${r.c}/${r.n}</b></div>`).join(''):'<div class="empty">Chưa có dữ liệu.</div>'}</div>
  <div class="h">Điểm ngữ pháp, từ vựng đang sai</div>
  <div class="card">${Object.keys(tags).length?Object.entries(tags).map(([t,qs])=>`<span class="chip">${esc(t)}</span>`).join(''):'<div class="empty">Chưa có.</div>'}</div>
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
