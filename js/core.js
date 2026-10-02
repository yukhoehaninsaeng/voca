(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VocabCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA_VERSION=2;
  const SOURCE_DEFS=[
    ['mine_words','내 단어','word','user'],['mine_sentences','내 문장','sentence','user'],
    ['toeic_p2','TOEIC Part 2','sentence','static'],['toeic_p3','TOEIC Part 3','sentence','static'],
    ['toeic_p4','TOEIC Part 4','sentence','static'],['toeic_p5','TOEIC Part 5','sentence','static'],
    ['vocab_core140','핵심 단어 140','word','static'],
    ...Array.from({length:9},(_,i)=>[`vocab_master_${i+1}`,`마스터 어휘 Part ${i+1}`,'word','static']),
    ['vocab_master_all','마스터 어휘 전체','word','virtual'],['vocab_all_unique','전체 어휘 팩','word','virtual'],
    ['mistakes','자주 틀린 항목','mixed','virtual']
  ];
  const MODE_RULES={flash:['word','sentence'],quiz:['word'],type:['word','sentence'],blank:['sentence'],full:['sentence'],speak:['sentence']};
  function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');}
  function stableHash(value){let h=0x811c9dc5;for(const ch of value){h^=ch.codePointAt(0);h=Math.imul(h,0x01000193);}return(h>>>0).toString(36);}
  function createRegistry(){
    const items=[],byId=new Map(),byKey=new Map();
    function add(type,en,ko,extra={}){
      const canonicalKey=`${type}\n${normalize(en)}\n${normalize(ko)}`;
      if(byKey.has(canonicalKey))return byKey.get(canonicalKey);
      const prefix=type==='word'?'w':type==='phrase'?'p':'s';let id=`${prefix}:${stableHash(canonicalKey)}`,n=0;
      while(byId.has(id)&&byId.get(id).canonicalKey!==canonicalKey)id=`${prefix}:${stableHash(canonicalKey)}-${++n}`;
      const item={id,type,en:String(en).trim(),ko:String(ko).trim(),normalizedEn:normalize(en),normalizedKo:normalize(ko),exampleItemIds:[],canonicalKey,...extra};
      items.push(item);byId.set(id,item);byKey.set(canonicalKey,item);return item;
    }
    return{items,byId,add};
  }
  function buildCatalog({words=[],sents=[],toeicParts={},customCards=[]}={}){
    const reg=createRegistry(),memberships=[],memberKeys=new Set();
    const sources=SOURCE_DEFS.map(([id,name,itemType,kind])=>({id,name,itemType,kind}));
    const addMember=(sourceId,item,order)=>{const key=`${sourceId}\n${item.id}`;if(!memberKeys.has(key)){memberKeys.add(key);memberships.push({sourceId,itemId:item.id,order});}};
    words.forEach((w,i)=>addMember('mine_words',reg.add('word',w.word??w.en,w.meaning??w.ko),i));
    sents.forEach((s,i)=>addMember('mine_sentences',reg.add('sentence',s.en,s.ko),i));
    ['p2','p3','p4','p5'].forEach(part=>(toeicParts[part]||[]).forEach((s,i)=>addMember(`toeic_${part}`,reg.add('sentence',s.en,s.ko),i)));
    const wordCards=customCards.filter(c=>c.type==='word');
    wordCards.forEach((card,index)=>{const sourceId=index===0?'vocab_core140':`vocab_master_${index}`;(card.words||[]).forEach((w,i)=>addMember(sourceId,reg.add('word',w.word,w.meaning),i));});
    const copyUnion=(target,ids)=>{let order=0;memberships.filter(m=>ids.includes(m.sourceId)).forEach(m=>addMember(target,reg.byId.get(m.itemId),order++));};
    copyUnion('vocab_master_all',Array.from({length:9},(_,i)=>`vocab_master_${i+1}`));
    copyUnion('vocab_all_unique',['vocab_core140','vocab_master_all']);
    return{items:reg.items,sources,memberships};
  }
  function selectItems(sourceIds,catalog,progressById={}){
    const ids=new Set(sourceIds||[]),wanted=new Set();
    catalog.memberships.forEach(m=>{if(ids.has(m.sourceId))wanted.add(m.itemId);});
    if(ids.has('mistakes'))Object.entries(progressById).forEach(([id,p])=>{if(p.lapses>=2)wanted.add(id);});
    return[...wanted].map(id=>catalog.items.find(item=>item.id===id)).filter(Boolean);
  }
  function selectCounts(items,progressById={},now=Date.now()){
    const out={total:items.length,fresh:0,due:0,learning:0,mastered:0};
    items.forEach(item=>{const p=progressById[item.id];if(!p||p.state==='new')out.fresh++;if(p&&p.state!=='mastered'&&p.dueAt<=now)out.due++;if(p&&(p.state==='learning'||p.state==='review'))out.learning++;if(p?.state==='mastered')out.mastered++;});return out;
  }
  const localDate=(date=new Date())=>{const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`;};
  function selectTodayStats(events,date=localDate()){const answered=(events||[]).filter(e=>e.localDate===date&&e.correct!==null);const correct=answered.filter(e=>e.correct).length;return{attempts:answered.length,correct,accuracy:answered.length?Math.round(correct/answered.length*100):null,uniqueItems:new Set(answered.map(e=>e.itemId)).size};}
  function recordStudyEvent(state,input){const ts=input.ts||Date.now(),correct=input.correct??null,rating=input.rating||(correct?'good':'again'),old=state.progress[input.itemId]||{state:'new',reps:0,lapses:0,streak:0,intervalDays:0,dueAt:ts};const days=correct?Math.max(1,old.intervalDays?old.intervalDays*2:1):0;const progress={...old,state:correct?(old.reps>=4?'mastered':'review'):'learning',reps:old.reps+1,lapses:old.lapses+(correct?0:1),streak:correct?old.streak+1:0,intervalDays:days,dueAt:ts+days*86400000,lastReviewedAt:ts};state.progress[input.itemId]=progress;const event={id:`evt:${ts.toString(36)}:${Math.random().toString(36).slice(2,8)}`,ts,localDate:localDate(new Date(ts)),itemId:input.itemId,sourceIds:[...(input.sourceIds||[])],mode:input.mode,rating,correct,elapsedMs:input.elapsedMs,sessionId:input.sessionId||'legacy'};state.events.push(event);return event;}
  function compatibleItems(items,mode){return(items||[]).filter(i=>(MODE_RULES[mode]||[]).includes(i.type));}
  function migrationReport(storage,catalog,legacy){
    if(storage.getItem('vm-migrated-v2')==='1'){return JSON.parse(storage.getItem('vm-migration-report')||'{}');}
    const keys=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&k.startsWith('vm-')&&!k.startsWith('vm-backup-v1-'))keys.push(k);}
    keys.forEach(k=>storage.setItem(`vm-backup-v1-${k.slice(3)}`,storage.getItem(k)));
    const progress={},conflicts=[];
    const migrate=(rows,errors,sourceId)=>Object.entries(errors||{}).forEach(([key,count])=>{if(!Number.isInteger(+key))return;const row=rows[+key];if(!row)return;const en=row.word??row.en,ko=row.meaning??row.ko,item=catalog.items.find(x=>x.normalizedEn===normalize(en)&&x.normalizedKo===normalize(ko));if(item&&count>0)progress[item.id]={state:'review',reps:+count,lapses:+count,streak:0,intervalDays:0,dueAt:Date.now(),lastReviewedAt:null};});
    migrate(legacy.words,legacy.errCount,'mine_words');migrate(legacy.sents,legacy.sErrCount,'mine_sentences');
    Object.entries(legacy.errCount||{}).filter(([k])=>k.startsWith('__w__')).forEach(([k,count])=>{const matches=catalog.items.filter(i=>i.type==='word'&&i.normalizedEn===normalize(k.slice(5)));if(matches.length===1&&count>0)progress[matches[0].id]={state:'review',reps:+count,lapses:+count,streak:0,intervalDays:0,dueAt:Date.now(),lastReviewedAt:null};else conflicts.push({key:k,candidates:matches.length});});
    const report={backedUp:keys.length,progress:Object.keys(progress).length,conflicts};storage.setItem('vm-progress-v2',JSON.stringify(progress));storage.setItem('vm-events-v2','[]');storage.setItem('vm-migration-report',JSON.stringify(report));storage.setItem('vm-migrated-v2','1');return report;
  }
  function exportEnvelope(catalog,state,selection){return{app:'vocabmaster',schemaVersion:SCHEMA_VERSION,exportedAt:Date.now(),items:catalog.items,memberships:catalog.memberships,progress:Object.entries(state.progress).map(([itemId,value])=>({itemId,...value})),events:state.events,settings:{selection}};}
  function inspectImport(value,catalog){let data;try{data=typeof value==='string'?JSON.parse(value):value;}catch(e){return{valid:false,newCount:0,duplicateCount:0,conflictCount:0,invalidCount:1,error:'JSON 형식이 올바르지 않습니다.'};}if(data?.app!=='vocabmaster'||data.schemaVersion!==2)return{valid:false,newCount:0,duplicateCount:0,conflictCount:0,invalidCount:1,error:'지원하지 않는 백업입니다.'};const known=new Map(catalog.items.map(i=>[i.id,i]));let newCount=0,duplicateCount=0,conflictCount=0,invalidCount=0;(data.items||[]).forEach(i=>{if(!i.id||!i.en||!i.ko){invalidCount++;return;}const old=known.get(i.id);if(!old)newCount++;else if(old.canonicalKey===i.canonicalKey)duplicateCount++;else conflictCount++;});return{valid:invalidCount===0&&conflictCount===0,newCount,duplicateCount,conflictCount,invalidCount,data};}
  class LocalStorageRepository{
    constructor(storage){this.storage=storage;}
    loadSnapshot(){return{progress:JSON.parse(this.storage.getItem('vm-progress-v2')||'{}'),events:JSON.parse(this.storage.getItem('vm-events-v2')||'[]'),selection:JSON.parse(this.storage.getItem('vm-selection-v2')||'null')};}
    saveSnapshot(snapshot){const previous={progress:this.storage.getItem('vm-progress-v2'),events:this.storage.getItem('vm-events-v2'),selection:this.storage.getItem('vm-selection-v2')};try{this.storage.setItem('vm-progress-v2',JSON.stringify(snapshot.progress||{}));this.storage.setItem('vm-events-v2',JSON.stringify(snapshot.events||[]));this.storage.setItem('vm-selection-v2',JSON.stringify(snapshot.selection||null));}catch(error){Object.entries(previous).forEach(([key,value])=>{const storageKey=`vm-${key}-v2`;if(value===null)this.storage.removeItem(storageKey);else this.storage.setItem(storageKey,value);});throw error;}}
    appendEvent(event){const snapshot=this.loadSnapshot();if(!snapshot.events.some(old=>old.id===event.id))snapshot.events.push(event);this.saveSnapshot(snapshot);}
    exportJson(catalog,snapshot=this.loadSnapshot()){return JSON.stringify(exportEnvelope(catalog,snapshot,snapshot.selection),null,2);}
    previewImport(json,catalog){return inspectImport(json,catalog);}
    applyImport(report,catalog,{merge=true}={}){if(!report?.valid||!report.data)throw new Error('검증되지 않은 백업은 적용할 수 없습니다.');const current=this.loadSnapshot(),incoming=report.data;const progress=merge?{...current.progress}:{};(incoming.progress||[]).forEach(item=>{if(catalog.items.some(known=>known.id===item.itemId))progress[item.itemId]=item;});const events=merge?[...current.events]:[];(incoming.events||[]).forEach(event=>{if(catalog.items.some(known=>known.id===event.itemId)&&!events.some(old=>old.id===event.id))events.push(event);});const selection=incoming.settings?.selection||current.selection;const snapshot={progress,events,selection};this.saveSnapshot(snapshot);return snapshot;}
  }
  return{SCHEMA_VERSION,MODE_RULES,normalize,stableHash,buildCatalog,selectItems,selectCounts,selectTodayStats,recordStudyEvent,compatibleItems,localDate,migrationReport,exportEnvelope,inspectImport,LocalStorageRepository};
});
