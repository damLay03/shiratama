/* shiratama — nhập deck Anki (.apkg/.colpkg) và ôn bằng FSRS, giữ nguyên lịch ôn cũ.
   Hỗ trợ collection.anki21b (Anki 23.10+, nén zstd), collection.anki21 và collection.anki2. */
(function(){
'use strict';
const LIBS={
  zip:'lib/jszip.min.js',
  sql:'lib/sql-wasm.js',
  wasm:'lib/sql-wasm.wasm',
  zstd:'lib/fzstd.js'
};
const loaded={};
function script(u){return loaded[u]||(loaded[u]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>rej(new Error('Không tải được thư viện'));document.head.appendChild(s)}))}

/* ---------- IndexedDB ---------- */
const DBN='shiratama-anki';
let dbp=null;
function db(){return dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open(DBN,2);r.onupgradeneeded=()=>{const d=r.result;const has=n=>d.objectStoreNames.contains(n);
  if(!has('cards'))d.createObjectStore('cards',{keyPath:'id'}).createIndex('deck','deck');
  if(!has('decks'))d.createObjectStore('decks',{keyPath:'id'});
  if(!has('media'))d.createObjectStore('media',{keyPath:'name'});
  if(!has('revlog'))d.createObjectStore('revlog',{keyPath:'id'})};r.onsuccess=()=>{const d=r.result;d.onclose=()=>{dbp=null};d.onversionchange=()=>{d.close();dbp=null};res(d)};r.onerror=()=>{dbp=null;rej(r.error)};r.onblocked=()=>{}}))}
// máy để lâu ở nền có thể đóng kết nối IndexedDB: mở lại và thử thêm một lần
async function withDb(run){try{return await run(await db())}catch(e){if(e&&(e.name==='InvalidStateError'||e.name==='TransactionInactiveError'||/clos/i.test(e.message||''))){dbp=null;return await run(await db())}throw e}}
function tx(store,mode,fn){return withDb(d=>new Promise((res,rej)=>{const t=d.transaction(store,mode);const out=fn(t.objectStore(store));t.oncomplete=()=>res(out instanceof IDBRequest?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('abort'))}))}
const all=(store)=>tx(store,'readonly',s=>s.getAll());
const put=(store,v)=>tx(store,'readwrite',s=>s.put(v));
function putMany(store,arr){return withDb(d=>new Promise((res,rej)=>{const t=d.transaction(store,'readwrite');const s=t.objectStore(store);arr.forEach(v=>s.put(v));t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('abort'))}))}
async function delDeck(id){const d=await db();const cards=(await all('cards')).filter(c=>c.deck===id);return new Promise((res,rej)=>{const t=d.transaction(['cards','decks'],'readwrite');cards.forEach(c=>t.objectStore('cards').delete(c.id));t.objectStore('decks').delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}

/* ---------- protobuf (đọc chuỗi trong cấu hình template của Anki mới) ---------- */
function pbStrings(buf){const out={};let i=0;const u=buf;
  const varint=()=>{let x=0,s=0,b;do{b=u[i++];x+= (b&0x7f)*Math.pow(2,s);s+=7}while(b&0x80);return x};
  while(i<u.length){const key=varint();const f=Math.floor(key/8),w=key&7;
    if(w===0)varint();else if(w===1)i+=8;else if(w===5)i+=4;
    else if(w===2){const n=varint();out[f]=new TextDecoder().decode(u.subarray(i,i+n));i+=n}else break}
  return out}

/* ---------- template ---------- */
function renderTpl(tpl,fields,front){
  let s=tpl.replace(/\{\{FrontSide\}\}/g,front||'');
  // {{#F}}...{{/F}} và {{^F}}...{{/F}}
  for(let k=0;k<3;k++)s=s.replace(/\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,(m,t,f,inner)=>{const v=(fields[f.trim()]||'').replace(/<[^>]*>/g,'').trim();return (t==='#'?v:!v)?inner:''});
  s=s.replace(/\{\{([^}]+)\}\}/g,(m,expr)=>{const parts=expr.split(':');const name=parts.pop().trim();const filters=parts.map(x=>x.trim());
    if(name==='Tags'||name==='Deck'||name==='Card'||name==='Subdeck'||name==='Type')return '';
    let v=fields[name];if(v==null)return '';
    if(filters.includes('cloze'))v=v.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g,'$1');
    if(filters.includes('text'))v=v.replace(/<[^>]*>/g,'');
    if(filters.includes('type'))return '';
    if(filters.includes('kana'))return furi(v,'kana');
    if(filters.includes('kanji'))return furi(v,'kanji');
    if(filters.includes('furigana'))return furi(v,'ruby');
    return v});
  return s}
function furi(v,mode){return v.replace(/ ?([^ >\[]+?)\[(.+?)\]/g,(m,base,rd)=>mode==='kana'?rd:mode==='kanji'?base:`<ruby>${base}<rt>${rd}</rt></ruby>`)}
function clean(html){return html.replace(/\[sound:[^\]]+\]/g,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/ on\w+="[^"]*"/gi,'')}

/* ---------- import ---------- */
async function importApkg(file,onStep){
  onStep('Đang tải thư viện…');
  await script(LIBS.zip);await script(LIBS.sql);
  const SQL=await initSqlJs({locateFile:()=>LIBS.wasm});
  onStep('Đang giải nén…');
  const zip=await JSZip.loadAsync(file);
  let bytes=null;
  if(zip.file('collection.anki21b')){await script(LIBS.zstd);bytes=fzstd.decompress(new Uint8Array(await zip.file('collection.anki21b').async('uint8array')))}
  else if(zip.file('collection.anki21'))bytes=await zip.file('collection.anki21').async('uint8array');
  else if(zip.file('collection.anki2'))bytes=await zip.file('collection.anki2').async('uint8array');
  else throw new Error('Không thấy dữ liệu Anki trong file');
  let d=new SQL.Database(bytes);
  // Anki 2.1.50+ dùng collation 'unicase' mà sql.js không có: gỡ khỏi schema rồi mở lại
  try{const u=d.exec("select count(*) from sqlite_master where sql like '%unicase%'");if(u.length&&u[0].values[0][0]>0){
    d.exec("PRAGMA writable_schema=ON;DELETE FROM sqlite_master WHERE type='index' AND sql LIKE '%unicase%';UPDATE sqlite_master SET sql=replace(sql,'COLLATE unicase','') WHERE sql LIKE '%unicase%';PRAGMA writable_schema=OFF;");
    const b2=d.export();d.close();d=new SQL.Database(b2)}}catch(e){console.warn('unicase',e)}
  const q=(sql)=>{const r=d.exec(sql);if(!r.length)return[];const {columns,values}=r[0];return values.map(v=>Object.fromEntries(columns.map((c,i)=>[c,v[i]])))};
  const has=(t)=>q(`select name from sqlite_master where type='table' and name='${t}'`).length>0;
  const col=q('select * from col')[0];
  const crt=col.crt; // giây
  // ---- note types
  const models={};
  if(has('notetypes')){
    q('select id,name from notetypes').forEach(m=>models[m.id]={name:m.name,flds:[],tmpls:[]});
    q('select ntid,ord,name from fields order by ntid,ord').forEach(f=>{if(models[f.ntid])models[f.ntid].flds[f.ord]=f.name});
    const st=d.prepare('select ntid,ord,name,config from templates order by ntid,ord');
    while(st.step()){const r=st.getAsObject();const cfg=pbStrings(r.config);if(models[r.ntid])models[r.ntid].tmpls[r.ord]={name:r.name,q:cfg[1]||'',a:cfg[2]||''}}st.free();
  }
  if(!Object.keys(models).length&&col.models){const ms=JSON.parse(col.models);Object.values(ms).forEach(m=>models[m.id]={name:m.name,flds:m.flds.map(f=>f.name),tmpls:m.tmpls.map(t=>({name:t.name,q:t.qfmt,a:t.afmt}))})}
  // ---- decks
  const decks={};
  if(has('decks'))q('select id,name from decks').forEach(x=>decks[x.id]=x.name.replace(/\x1f/g,'::'));
  else if(col.decks)Object.values(JSON.parse(col.decks)).forEach(x=>decks[x.id]=x.name);
  // ---- notes
  const notes={};q('select id,guid,mid,flds,tags from notes').forEach(n=>notes[n.id]=n);
  // ---- revlog
  const rev={};q('select id,cid,ease,ivl,type from revlog order by id').forEach(r=>(rev[r.cid]=rev[r.cid]||[]).push(r));
  // ---- cards
  onStep('Đang chuyển lịch ôn…');
  const cards=q('select id,nid,did,ord,type,queue,due,ivl,factor,reps,lapses,data,odid,odue from cards');
  const out=[];let fsrsN=0,replay=0,skipped=0,kept=0;
  // thẻ đã ôn trong app (appAt) giữ lịch của app khi nhập lại deck đã cập nhật
  const prev={};(await all('cards')).forEach(x=>prev[x.id]=x);
  const now=Date.now();const today=Math.floor((now/1000-crt)/86400);
  for(const c of cards){
    const n=notes[c.nid];if(!n)continue;const m=models[n.mid]||{flds:[],tmpls:[]};
    const vals=n.flds.split('\x1f');
    if((vals[0]||'').trim()==='dsdshdids'){skipped++;continue} // thẻ dư đã gộp khi chuẩn hóa
    const fields={};vals.forEach((v,i)=>fields[m.flds[i]||('F'+i)]=v);
    const t=m.tmpls[c.ord]||m.tmpls[0];
    let front,back;
    if(t&&t.q){front=renderTpl(t.q,fields,'');back=renderTpl(t.a,fields,front)}else{front=vals[0];back=front+'<hr id=answer>'+vals.slice(1).join('<br>')}
    const did=c.odid||c.did, due0=c.odid?c.odue:c.due;
    // ---- lịch
    let card={due:new Date(now),stability:0,difficulty:0,elapsed_days:0,scheduled_days:0,reps:c.reps,lapses:c.lapses,state:0,learning_steps:0};
    const logs=(rev[c.id]||[]).filter(r=>r.ease>=1&&r.ease<=4&&r.type<=3);
    let data={};try{data=c.data?JSON.parse(c.data):{}}catch(e){}
    if(c.type!==0&&logs.length&&typeof FSRS!=='undefined'){
      if(data.s&&data.d){card.stability=data.s;card.difficulty=data.d;fsrsN++}
      else{ // dựng lại trạng thái nhớ từ lịch sử ôn
        const F=FSRS.fsrs(FSRS.generatorParameters({enable_fuzz:false}));let k=FSRS.createEmptyCard(new Date(logs[0].id));
        for(const r of logs){try{k=F.repeat(k,new Date(r.id))[r.ease].card}catch(e){}}
        card.stability=k.stability;card.difficulty=k.difficulty;replay++}
      card.last_review=new Date(data.lrt?data.lrt*1000:logs[logs.length-1].id);
    }
    if(c.type===2||c.type===3||c.type===1){
      card.state=c.type===2?2:c.type===3?3:1;
      if(c.queue===1||(c.type!==2&&due0>1e9))card.due=new Date(due0*1000);          // học/học lại: timestamp
      else card.due=new Date((crt+due0*86400)*1000);                                    // ôn: số ngày từ lúc tạo
      card.scheduled_days=Math.max(0,c.ivl);
      if(!card.last_review)card.last_review=new Date(card.due.getTime()-Math.max(1,c.ivl)*864e5);
      card.elapsed_days=Math.max(0,Math.round((now-card.last_review.getTime())/864e5));
      if(!card.stability){card.stability=Math.max(0.5,c.ivl||1);card.difficulty=Math.min(10,Math.max(1,11-(c.factor||2500)/250))}
    }
    const old=prev['a'+c.id];
    if(old&&old.appAt&&old.appAt>(data.lrt?data.lrt*1000:0)){card=old.card;kept++}
    out.push({id:'a'+c.id,appAt:old&&old.appAt||0,deck:String(did),front:clean(front),back:clean(back),card,susp:c.queue<0?1:0,nid:c.nid,guid:n.guid,fl:vals,tags:(n.tags||'').trim()});
  }
  // ---- media (ảnh) — lưu vào máy để hiện trong thẻ
  onStep('Đang lưu ảnh…');
  let mediaMap={};try{const mf=zip.file('media');if(mf){const txt=await mf.async('uint8array');try{mediaMap=JSON.parse(new TextDecoder().decode(txt))}catch(e){mediaMap={}}}}catch(e){}
  const media=[];
  for(const [k,name] of Object.entries(mediaMap)){if(!/\.(png|jpe?g|gif|webp|svg)$/i.test(name))continue;const f=zip.file(k);if(f)media.push({name,blob:await f.async('blob')})}
  // ---- lưu
  onStep('Đang lưu thẻ…');
  const deckRows=[...new Set(out.map(c=>c.deck))].map(id=>({id,name:decks[id]||'Deck '+id,src:file.name,at:Date.now()}));
  await putMany('decks',deckRows);await putMany('cards',out);if(media.length)await putMany('media',media);
  d.close();
  // bỏ thẻ dư còn sót trong app từ lần nhập trước
  const ids=new Set(out.map(o=>o.id)),cids=new Set(cards.map(c=>'a'+c.id));const stale=Object.values(prev).filter(x=>!ids.has(x.id)&&cids.has(x.id));
  if(stale.length)await tx('cards','readwrite',s=>{stale.forEach(x=>s.delete(x.id))});
  return {cards:out.length,decks:deckRows.length,fsrsN,replay,media:media.length,skipped,kept};
}

/* ---------- bộ sưu tập dựng sẵn trong app (data/col, mã hóa bằng mã mở đề) ---------- */
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function kdf(code,salt){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(code.trim()),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt'])}
async function gunzip(buf){const ds=new DecompressionStream('gzip');const st=new Blob([buf]).stream().pipeThrough(ds);return await new Response(st).text()}
const lsg=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lss=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
async function loadBundle(code,onStep){
  let head;try{head=await fetch('data/col/col.enc.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.json()})}catch(e){return null}
  const have=lsg('shiratama-colv',0);
  const cnt=await tx('cards','readonly',s=>s.count());
  if(have>=head.v&&cnt>0)return null;
  onStep&&onStep('Đang mở bộ thẻ…');
  const key=await kdf(code,b64(head.salt));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(head.iv)},key,b64(head.data));
  const B=JSON.parse(await gunzip(plain));
  onStep&&onStep('Đang lưu thẻ…');
  const prev={};(await all('cards')).forEach(x=>prev[x.id]=x);
  const ids=new Set();let kept=0;
  const cards=B.cards.map(c=>{ids.add(c.id);const o=prev[c.id];const lr=c.card.last_review?new Date(c.card.last_review).getTime():0;
    if(o&&o.appAt&&o.appAt>lr){kept++;return Object.assign({},c,{card:o.card,appAt:o.appAt,susp:o.susp,mt:o.mt,edited:o.edited,tags:o.tags??c.tags,buried:o.buried,front:o.edited?o.front:c.front,back:o.edited?o.back:c.back})}return c});
  await putMany('decks',B.decks);await putMany('cards',cards);
  // lịch sử ôn: gộp với lượt ôn đã làm trong app
  const oldRev={};(await all('revlog')).forEach(r=>oldRev[r.id]=r.logs);
  const revRows=Object.entries(B.revlog).map(([id,logs])=>{const extra=(oldRev[id]||[]).filter(l=>l[0]>(logs.length?logs[logs.length-1][0]:0));return {id,logs:logs.concat(extra)}});
  await putMany('revlog',revRows);
  // thẻ đã xóa bên Anki (id 'a…' không còn trong bộ mới)
  const stale=Object.keys(prev).filter(id=>id[0]==='a'&&!ids.has(id));
  if(stale.length)await tx('cards','readwrite',s=>{stale.forEach(id=>s.delete(id))});
  lss('shiratama-media',{map:B.media,salt:B.msalt});lss('shiratama-colv',head.v);
  return {cards:cards.length,kept,removed:stale.length};
}

/* ---------- media trong thẻ ---------- */
const urlCache={};let mkey=null;
async function mediaFromBundle(n){
  const M=lsg('shiratama-media',null);if(!M||!M.map[n])return null;
  const code=lsg('shiratama-code',null);if(!code)return null;
  if(!mkey)mkey=await kdf(code,b64(M.salt));
  const [h,type]=M.map[n];const buf=new Uint8Array(await fetch('data/col/m/'+h+'.bin').then(r=>r.arrayBuffer()));
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.subarray(0,12)},mkey,buf.subarray(12));
  const blob=new Blob([raw],{type});try{await put('media',{name:n,blob})}catch(e){}return blob;
}
async function hydrate(el){const imgs=el.querySelectorAll('img[src]');for(const im of imgs){const n=decodeURIComponent(im.getAttribute('src'));if(/^(https?:|data:|blob:)/.test(n))continue;
  try{if(!urlCache[n]){const m=await tx('media','readonly',s=>s.get(n));const blob=m?m.blob:await mediaFromBundle(n);if(blob)urlCache[n]=URL.createObjectURL(blob)}}catch(e){}
  if(urlCache[n])im.src=urlCache[n]}}

async function logReview(id,entry){const r=await tx('revlog','readonly',s=>s.get(id));const row=(r&&Array.isArray(r.logs))?r:{id,logs:[]};row.logs.push(entry);await put('revlog',row)}
async function getRev(id){return tx('revlog','readonly',s=>s.get(id))}
const del=(store,id)=>tx(store,'readwrite',s=>s.delete(id));

window.ANKI={importApkg,all,put,putMany,del,delDeck,hydrate,loadBundle,logReview,getRev};
})();
