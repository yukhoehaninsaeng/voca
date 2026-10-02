(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VocabCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SCHEMA_VERSION=2;
  const DAY_MS=86400000;
  const SOURCE_DEFS=[
    ['mine_words','내 단어','word','user'],
    ['mine_sentences','내 문장','sentence','user'],
    ['toeic_p2','TOEIC Part 2','sentence','static'],
    ['toeic_p3','TOEIC Part 3','sentence','static'],
    ['toeic_p4','TOEIC Part 4','sentence','static'],
    ['toeic_p5','TOEIC Part 5','sentence','static'],
    ['vocab_core140','핵심 단어 140','word','static'],
    ...Array.from({length:9},(_,index)=>[`vocab_master_${index+1}`,`마스터 어휘 Part ${index+1}`,'word','static']),
    ['vocab_master_all','마스터 어휘 전체','word','virtual'],
    ['vocab_all_unique','전체 어휘 팩','word','virtual'],
    ['mistakes','자주 틀린 항목','mixed','virtual']
  ];
  const MODE_RULES={
    flash:['word','sentence'],
    quiz:['word'],
    type:['word','sentence'],
    blank:['sentence'],
    full:['sentence'],
    speak:['sentence']
  };

  function normalize(value){
    return String(value??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
  }
  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function stableHash(value){
    let hash=0x811c9dc5;
    for(const char of value){hash^=char.codePointAt(0);hash=Math.imul(hash,0x01000193);}
    return(hash>>>0).toString(36);
  }
  function canonicalKey(type,en,ko){return`${type}\n${normalize(en)}\n${normalize(ko)}`;}
  function itemIdFor(type,en,ko,hash=stableHash){
    const key=canonicalKey(type,en,ko);
    const prefix=type==='word'?'w':type==='phrase'?'p':'s';
    return{id:`${prefix}:${hash(key)}`,key};
  }
  function createRegistry(hash=stableHash){
    const items=[],byId=new Map(),byKey=new Map();
    function add(type,en,ko,extra={}){
      if(!['word','sentence','phrase'].includes(type))throw new Error(`지원하지 않는 Item 타입: ${type}`);
      const generated=itemIdFor(type,en,ko,hash);
      if(byKey.has(generated.key))return byKey.get(generated.key);
      const collision=byId.get(generated.id);
      if(collision&&collision.canonicalKey!==generated.key)throw new Error(`Item ID 해시 충돌: ${generated.id}`);
      const item={id:generated.id,type,en:String(en??'').trim(),ko:String(ko??'').trim(),normalizedEn:normalize(en),normalizedKo:normalize(ko),exampleItemIds:[],canonicalKey:generated.key,...extra};
      items.push(item);byId.set(item.id,item);byKey.set(generated.key,item);return item;
    }
    return{items,byId,add};
  }
  function buildCatalog({words=[],sents=[],toeicParts={},customCards=[]}={}){
    const registry=createRegistry(),memberships=[],membershipKeys=new Set(),seedProgress={};
    const sources=SOURCE_DEFS.map(([id,name,itemType,kind])=>({id,name,itemType,kind}));
    function addMembership(sourceId,item,order){
      const key=`${sourceId}\n${item.id}`;
      if(membershipKeys.has(key))return;
      membershipKeys.add(key);memberships.push({sourceId,itemId:item.id,order});
    }
    words.forEach((word,index)=>addMembership('mine_words',registry.add('word',word.word??word.en,word.meaning??word.ko),index));
    sents.forEach((sentence,index)=>addMembership('mine_sentences',registry.add('sentence',sentence.en,sentence.ko),index));
    ['p2','p3','p4','p5'].forEach(part=>(toeicParts[part]||[]).forEach((sentence,index)=>addMembership(`toeic_${part}`,registry.add('sentence',sentence.en,sentence.ko),index)));
    const wordCards=customCards.filter(card=>card.type==='word');
    wordCards.forEach((card,index)=>{
      const sourceId=index===0?'vocab_core140':`vocab_master_${index}`;
      (card.words||[]).forEach((word,order)=>addMembership(sourceId,registry.add('word',word.word,word.meaning),order));
    });
    customCards.filter(card=>card.type==='mistake').forEach(card=>(card.items||[]).forEach(entry=>{
      const item=registry.add('word',entry.correct,`철자 주의: ${entry.wrong} → ${entry.correct}${entry.note?` (${entry.note})`:''}`);
      seedProgress[item.id]={state:'review',reps:2,lapses:2,streak:0,intervalDays:0,dueAt:0,lastReviewedAt:null};
    }));
    function copyUnion(target,sourceIds){let order=0;memberships.filter(member=>sourceIds.includes(member.sourceId)).forEach(member=>addMembership(target,registry.byId.get(member.itemId),order++));}
    copyUnion('vocab_master_all',Array.from({length:9},(_,index)=>`vocab_master_${index+1}`));
    copyUnion('vocab_all_unique',['vocab_core140','vocab_master_all']);
    return{items:registry.items,sources,memberships,seedProgress};
  }
  function selectItems(sourceIds,catalog,progressById={}){
    const selected=new Set(sourceIds||[]),ids=new Set();
    catalog.memberships.forEach(member=>{if(selected.has(member.sourceId))ids.add(member.itemId);});
    if(selected.has('mistakes'))Object.entries(progressById).forEach(([id,progress])=>{if(progress?.lapses>=2)ids.add(id);});
    const byId=new Map(catalog.items.map(item=>[item.id,item]));
    return[...ids].map(id=>byId.get(id)).filter(Boolean);
  }
  function selectCounts(items,progressById={},now=Date.now()){
    const counts={total:items.length,fresh:0,due:0,learning:0,mastered:0};
    items.forEach(item=>{const progress=progressById[item.id];if(!progress||progress.state==='new')counts.fresh++;if(progress&&progress.state!=='mastered'&&progress.dueAt<=now)counts.due++;if(progress&&(progress.state==='learning'||progress.state==='review'))counts.learning++;if(progress?.state==='mastered')counts.mastered++;});
    return counts;
  }
  function localDate(date=new Date()){
    return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function selectTodayStats(events,date=localDate()){
    const answered=(events||[]).filter(event=>event.localDate===date&&event.correct!==null);
    const correct=answered.filter(event=>event.correct).length;
    return{attempts:answered.length,correct,accuracy:answered.length?Math.round(correct/answered.length*100):null,uniqueItems:new Set(answered.map(event=>event.itemId)).size};
  }
  function recordStudyEvent(state,input){
    if(!input.itemId||!MODE_RULES[input.mode])throw new Error('유효한 itemId와 mode가 필요합니다.');
    const ts=input.ts??Date.now(),correct=input.correct??null,rating=input.rating||(correct===null?'skip':correct?'good':'again');
    const old=state.progress[input.itemId]||{state:'new',reps:0,lapses:0,streak:0,intervalDays:0,dueAt:ts};
    const intervalDays=correct?Math.max(1,old.intervalDays?old.intervalDays*2:1):0;
    state.progress[input.itemId]={...old,state:correct?(old.reps>=4?'mastered':'review'):'learning',reps:old.reps+1,lapses:old.lapses+(correct?0:1),streak:correct?old.streak+1:0,intervalDays,dueAt:ts+intervalDays*DAY_MS,lastReviewedAt:ts};
    const event={id:input.id||`evt:${ts.toString(36)}:${Math.random().toString(36).slice(2,8)}`,ts,localDate:input.localDate||localDate(new Date(ts)),itemId:input.itemId,sourceIds:[...(input.sourceIds||[])],mode:input.mode,rating,correct,elapsedMs:input.elapsedMs,sessionId:input.sessionId||'legacy'};
    state.events.push(event);return event;
  }
  function compatibleItems(items,mode){return(items||[]).filter(item=>(MODE_RULES[mode]||[]).includes(item.type));}
  function backupLegacy(storage){
    const keys=[];
    for(let index=0;index<storage.length;index++){const key=storage.key(index);if(key?.startsWith('vm-')&&!key.startsWith('vm-backup-v1-')&&!key.endsWith('-v2')&&key!=='vm-migrated-v2')keys.push(key);}
    keys.forEach(key=>{const backupKey=`vm-backup-v1-${key.slice(3)}`;const value=storage.getItem(key);storage.setItem(backupKey,value);if(storage.getItem(backupKey)!==value)throw new Error(`백업 검증 실패: ${key}`);});
    return keys;
  }
  function migrationReport(storage,catalog,legacy){
    if(storage.getItem('vm-migrated-v2')==='1')return JSON.parse(storage.getItem('vm-migration-report')||'{}');
    const backedUp=backupLegacy(storage),progress={...catalog.seedProgress},conflicts=[];
    function migrate(rows,errors){Object.entries(errors||{}).forEach(([key,count])=>{if(!/^\d+$/.test(key)||!(+count>0))return;const row=rows[+key];if(!row)return;const en=row.word??row.en,ko=row.meaning??row.ko,item=catalog.items.find(candidate=>candidate.normalizedEn===normalize(en)&&candidate.normalizedKo===normalize(ko));if(item)progress[item.id]={state:'review',reps:+count,lapses:+count,streak:0,intervalDays:0,dueAt:Date.now(),lastReviewedAt:null};});}
    migrate(legacy.words||[],legacy.errCount);migrate(legacy.sents||[],legacy.sErrCount);
    Object.entries(legacy.errCount||{}).filter(([key])=>key.startsWith('__w__')).forEach(([key,count])=>{const matches=catalog.items.filter(item=>item.type==='word'&&item.normalizedEn===normalize(key.slice(5)));if(matches.length===1&&+count>0)progress[matches[0].id]={state:'review',reps:+count,lapses:+count,streak:0,intervalDays:0,dueAt:Date.now(),lastReviewedAt:null};else conflicts.push({key,candidates:matches.length});});
    const report={backedUp:backedUp.length,userItems:(legacy.words||[]).length+(legacy.sents||[]).length,progress:Object.keys(progress).length,conflicts,unrecoverable:['toeicErrCount']};
    storage.setItem('vm-progress-v2',JSON.stringify(progress));storage.setItem('vm-events-v2','[]');storage.setItem('vm-migration-report',JSON.stringify(report));storage.setItem('vm-migrated-v2','1');return report;
  }
  function exportEnvelope(catalog,state,selection){
    return{app:'vocabmaster',schemaVersion:SCHEMA_VERSION,exportedAt:Date.now(),items:catalog.items,memberships:catalog.memberships,progress:Object.entries(state.progress||{}).map(([itemId,value])=>({itemId,...value})),events:state.events||[],settings:{selection}};
  }
  function inspectImport(value,catalog){
    let data;try{data=typeof value==='string'?JSON.parse(value):value;}catch(error){return{valid:false,newCount:0,duplicateCount:0,conflictCount:0,invalidCount:1,error:'JSON 형식이 올바르지 않습니다.'};}
    if(data?.app!=='vocabmaster'||data.schemaVersion!==SCHEMA_VERSION)return{valid:false,newCount:0,duplicateCount:0,conflictCount:0,invalidCount:1,error:'지원하지 않는 백업입니다.'};
    const known=new Map(catalog.items.map(item=>[item.id,item])),imported=new Map();let newCount=0,duplicateCount=0,conflictCount=0,invalidCount=0;
    for(const item of data.items||[]){if(!item?.id||!item.type||typeof item.en!=='string'||typeof item.ko!=='string'){invalidCount++;continue;}const expected=itemIdFor(item.type,item.en,item.ko);if(expected.id!==item.id||expected.key!==item.canonicalKey){invalidCount++;continue;}const old=known.get(item.id)||imported.get(item.id);if(!old){newCount++;imported.set(item.id,item);}else if(old.canonicalKey===item.canonicalKey)duplicateCount++;else conflictCount++;}
    const validIds=new Set([...known.keys(),...imported.keys()]);
    for(const member of data.memberships||[])if(!member?.sourceId||!validIds.has(member.itemId)||!Number.isFinite(member.order))invalidCount++;
    for(const progress of data.progress||[])if(!validIds.has(progress?.itemId)||!['new','learning','review','mastered'].includes(progress?.state))invalidCount++;
    for(const event of data.events||[])if(!event?.id||!validIds.has(event.itemId)||!MODE_RULES[event.mode]||!['again','hard','good','easy','skip'].includes(event.rating))invalidCount++;
    return{valid:invalidCount===0&&conflictCount===0,newCount,duplicateCount,conflictCount,invalidCount,data,error:invalidCount||conflictCount?'백업에 충돌하거나 무효인 데이터가 있습니다.':''};
  }
  class LocalStorageRepository{
    constructor(storage){this.storage=storage;}
    loadSnapshot(){return{progress:JSON.parse(this.storage.getItem('vm-progress-v2')||'{}'),events:JSON.parse(this.storage.getItem('vm-events-v2')||'[]'),selection:JSON.parse(this.storage.getItem('vm-selection-v2')||'null')};}
    saveSnapshot(snapshot){
      const keys=['vm-progress-v2','vm-events-v2','vm-selection-v2'],values=[snapshot.progress||{},snapshot.events||[],snapshot.selection||null],previous=keys.map(key=>this.storage.getItem(key));
      try{keys.forEach((key,index)=>this.storage.setItem(key,JSON.stringify(values[index])));}catch(error){keys.forEach((key,index)=>{if(previous[index]===null)this.storage.removeItem(key);else this.storage.setItem(key,previous[index]);});throw error;}
    }
    appendEvent(event){const snapshot=this.loadSnapshot();if(!snapshot.events.some(old=>old.id===event.id))snapshot.events.push(event);this.saveSnapshot(snapshot);}
    exportJson(catalog,snapshot=this.loadSnapshot()){return JSON.stringify(exportEnvelope(catalog,snapshot,snapshot.selection),null,2);}
    previewImport(json,catalog){return inspectImport(json,catalog);}
    applyImport(report,catalog,{merge=true}={}){
      if(!report?.valid||!report.data)throw new Error('검증되지 않은 백업은 적용할 수 없습니다.');
      const current=this.loadSnapshot(),incoming=report.data,knownIds=new Set(catalog.items.map(item=>item.id)),progress=merge?{...current.progress}:{};
      (incoming.progress||[]).forEach(item=>{if(knownIds.has(item.itemId)){const{itemId,...value}=item;progress[itemId]=value;}});
      const events=merge?[...current.events]:[];(incoming.events||[]).forEach(event=>{if(knownIds.has(event.itemId)&&!events.some(old=>old.id===event.id))events.push(event);});
      const selection=incoming.settings?.selection||current.selection,snapshot={progress,events,selection};this.saveSnapshot(snapshot);return snapshot;
    }
  }
  return{SCHEMA_VERSION,MODE_RULES,normalize,escapeHtml,stableHash,canonicalKey,itemIdFor,createRegistry,buildCatalog,selectItems,selectCounts,selectTodayStats,recordStudyEvent,compatibleItems,localDate,backupLegacy,migrationReport,exportEnvelope,inspectImport,LocalStorageRepository};
});
