(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VocabCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SCHEMA_VERSION=2;
  const DAY_MS=86400000;
  const MAX_INTERVAL_DAYS=365;
  const SKILLS=['recognition','recall','production','legacy'];
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
    items.forEach(item=>{const progress=progressFor(progressById,item.id);if(!progress||progress.state==='new')counts.fresh++;if(progress&&progress.dueAt<=now)counts.due++;if(progress&&(progress.state==='learning'||progress.state==='review'))counts.learning++;if(progress?.state==='mastered')counts.mastered++;});
    return counts;
  }
  function progressKey(itemId,skill='recall'){return`${itemId}::${skill}`;}
  function progressFor(progress,itemId,skill){
    if(skill)return progress[progressKey(itemId,skill)]||progress[itemId];
    return SKILLS.map(value=>progress[progressKey(itemId,value)]).find(Boolean)||progress[itemId];
  }
  function addLocalDays(local,days){const [y,m,d]=local.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d+days));return date.toISOString().slice(0,10);}
  function scheduleProgress(old={},rating,local=localDate(),options={}){
    if(['skip','recognition_failed','grading_failed','cancelled'].includes(rating))return null;
    const previous=Math.max(0,Number(old.intervalDays)||0),successes=Number(old.successes)||0;
    let intervalDays=0;
    if(rating==='hard')intervalDays=previous?Math.max(1,Math.round(previous*1.2)):1;
    if(rating==='good')intervalDays=!previous?1:successes<2?3:Math.round(previous*2);
    if(rating==='easy')intervalDays=previous?Math.max(4,Math.round(previous*2.5)):4;
    intervalDays=Math.min(MAX_INTERVAL_DAYS,intervalDays);
    const passed=rating!=='again',nextSuccesses=passed?successes+1:0;
    return{...old,state:passed?(nextSuccesses>=5?'mastered':'review'):'learning',attempts:(old.attempts||old.reps||0)+1,reps:(old.reps||0)+1,lapses:(old.lapses||0)+(passed?0:1),successes:nextSuccesses,streak:passed?(old.streak||0)+1:0,intervalDays,dueDate:addLocalDays(local,intervalDays),dueAt:options.now==null?undefined:options.now+intervalDays*DAY_MS,lastRating:rating,lastHelped:Boolean(options.helped),lastReviewedAt:options.now};
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
    const ts=input.ts??Date.now(),date=input.localDate||localDate(new Date(ts)),correct=input.correct??null,rating=input.rating||(correct===null?'skip':correct?'good':'again'),skill=input.skill||({quiz:'recognition',flash:'recognition',type:'recall',blank:'recall',full:'production',speak:'production'}[input.mode]),attemptId=input.attemptId||input.id;
    if(attemptId){const duplicate=state.events.find(event=>event.attemptId===attemptId||event.id===attemptId);if(duplicate)return duplicate;}
    const key=progressKey(input.itemId,skill),old=state.progress[key]||state.progress[input.itemId]||{state:'new',attempts:0,lapses:0,successes:0,intervalDays:0};
    const updated=scheduleProgress(old,rating,date,{now:ts,helped:input.helped});if(updated)state.progress[key]=updated;
    const event={id:input.id||`evt:${ts.toString(36)}:${stableHash(`${input.itemId}:${attemptId||Math.random()}`)}`,attemptId:attemptId||null,ts,localDate:date,timezone:input.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone,itemId:input.itemId,sourceIds:[...(input.sourceIds||[])],mode:input.mode,skill,taskType:input.taskType||input.mode,outcome:updated?(correct?'correct':'incorrect'):'neutral',rating,correct,helped:Boolean(input.helped),elapsedMs:input.elapsedMs,sessionId:input.sessionId||'legacy'};
    state.events.push(event);return event;
  }
  function seededRank(seed,value){return stableHash(`${seed}:${value}`);}
  function createDailyPlan({catalog,progress={},profile={},localDate:date=localDate(),timezone='UTC',seed=date,budgetMinutes}={}){
    const minutes=budgetMinutes||profile.dailyMinutes||15,itemLimit=minutes<=5?Math.min(5,profile.dailyItemLimit||10):[5,10,15,20].includes(Number(profile.dailyItemLimit))?Number(profile.dailyItemLimit):10,all=selectItems(catalog.sources.filter(source=>source.kind!=='virtual').map(source=>source.id),catalog,progress),seen=new Set(),unique=all.filter(item=>!seen.has(item.id)&&seen.add(item.id));
    const entries=unique.map(item=>({item,p:progressFor(progress,item.id,'recall')})),due=entries.filter(x=>x.p&&((x.p.dueDate&&x.p.dueDate<=date)||(!x.p.dueDate&&x.p.dueAt<=Date.now()))).sort((a,b)=>String(a.p.dueDate||'').localeCompare(String(b.p.dueDate||''))||b.p.lapses-a.p.lapses||seededRank(seed,a.item.id).localeCompare(seededRank(seed,b.item.id))),fresh=entries.filter(x=>!x.p).sort((a,b)=>seededRank(seed,a.item.id).localeCompare(seededRank(seed,b.item.id)));
    const reviewLimit=Math.min(minutes<=5?5:10,itemLimit),chosenDue=due.slice(0,reviewLimit),newLimit=Math.max(0,itemLimit-chosenDue.length),chosenFresh=fresh.slice(0,newLimit),steps=[];
    chosenDue.forEach(({item},index)=>steps.push({taskId:`${date}:r:${index}:${item.id}`,itemId:item.id,skill:'recall',taskType:item.type==='sentence'?'full':'type',mode:item.type==='sentence'?'full':'type',reason:'오늘 복습 예정',estimatedSeconds:45}));
    chosenFresh.forEach(({item},index)=>steps.push({taskId:`${date}:n:${index}:${item.id}`,itemId:item.id,skill:'recognition',taskType:'flash',mode:'flash',reason:'목표에 맞는 새 표현',estimatedSeconds:50}));
    return{planId:`plan:${date}:${stableHash(`${seed}:${minutes}:${itemLimit}:${steps.map(s=>s.itemId).join(',')}`)}`,localDate:date,timezone,version:1,seed:String(seed),budgetMinutes:minutes,itemLimit,steps,estimatedSeconds:steps.reduce((sum,s)=>sum+s.estimatedSeconds,0),counts:{review:chosenDue.length,new:chosenFresh.length,practice:0},remainingReviewCount:Math.max(0,due.length-chosenDue.length)};
  }
  function createSession(plan,existing){if(existing&&!existing.completed&&existing.planId===plan.planId)return existing;return{sessionId:`session:${plan.planId}`,planId:plan.planId,localDate:plan.localDate,timezone:plan.timezone,steps:plan.steps,cursor:0,results:{},retryCounts:{},completed:false,startedAt:Date.now()};}
  function submitSessionAttempt(session,{taskId,attemptId,eventId}){if(session.results[attemptId])return false;session.results[attemptId]={taskId,eventId,submittedAt:Date.now()};const index=session.steps.findIndex(step=>step.taskId===taskId);if(index>=session.cursor)session.cursor=index+1;session.completed=session.cursor>=session.steps.length;return true;}
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
    return{app:'vocabmaster',schemaVersion:SCHEMA_VERSION,exportedAt:Date.now(),items:catalog.items,memberships:catalog.memberships,progress:Object.entries(state.progress||{}).map(([progressId,value])=>({progressId,itemId:progressId.split('::')[0],...value})),events:state.events||[],settings:{selection,profile:state.profile||null},plan:state.plan||null,session:state.session||null};
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
    read(key,fallback){const value=this.storage.getItem(key);if(value===null)return fallback;try{return JSON.parse(value);}catch(error){console.warn(`손상된 저장값을 무시합니다: ${key}`);return fallback;}}
    loadSnapshot(){return{progress:this.read('vm-progress-v2',{}),events:this.read('vm-events-v2',[]),selection:this.read('vm-selection-v2',null),profile:this.read('vm-profile-v2',null),plan:this.read('vm-plan-v2',null),session:this.read('vm-session-v2',null)};}
    saveSnapshot(snapshot){
      const keys=['vm-progress-v2','vm-events-v2','vm-selection-v2','vm-profile-v2','vm-plan-v2','vm-session-v2'],values=[snapshot.progress||{},snapshot.events||[],snapshot.selection||null,snapshot.profile||null,snapshot.plan||null,snapshot.session||null],previous=keys.map(key=>this.storage.getItem(key));
      try{keys.forEach((key,index)=>this.storage.setItem(key,JSON.stringify(values[index])));}catch(error){keys.forEach((key,index)=>{if(previous[index]===null)this.storage.removeItem(key);else this.storage.setItem(key,previous[index]);});throw error;}
    }
    appendEvent(event){const snapshot=this.loadSnapshot();if(!snapshot.events.some(old=>old.id===event.id))snapshot.events.push(event);this.saveSnapshot(snapshot);}
    exportJson(catalog,snapshot=this.loadSnapshot()){return JSON.stringify(exportEnvelope(catalog,snapshot,snapshot.selection),null,2);}
    previewImport(json,catalog){return inspectImport(json,catalog);}
    applyImport(report,catalog,{merge=true}={}){
      if(!report?.valid||!report.data)throw new Error('검증되지 않은 백업은 적용할 수 없습니다.');
      const current=this.loadSnapshot(),incoming=report.data,knownIds=new Set(catalog.items.map(item=>item.id)),progress=merge?{...current.progress}:{};
      (incoming.progress||[]).forEach(item=>{if(knownIds.has(item.itemId)){const{itemId,progressId,...value}=item;progress[progressId||itemId]=value;}});
      const events=merge?[...current.events]:[];(incoming.events||[]).forEach(event=>{if(knownIds.has(event.itemId)&&!events.some(old=>old.id===event.id))events.push(event);});
      const selection=incoming.settings?.selection||current.selection,snapshot={progress,events,selection,profile:incoming.settings?.profile||current.profile,plan:incoming.plan||current.plan,session:incoming.session||current.session};this.saveSnapshot(snapshot);return snapshot;
    }
  }
  return{SCHEMA_VERSION,MODE_RULES,SKILLS,normalize,escapeHtml,stableHash,canonicalKey,itemIdFor,createRegistry,buildCatalog,selectItems,selectCounts,selectTodayStats,progressKey,progressFor,scheduleProgress,recordStudyEvent,createDailyPlan,createSession,submitSessionAttempt,compatibleItems,localDate,backupLegacy,migrationReport,exportEnvelope,inspectImport,LocalStorageRepository};
});
