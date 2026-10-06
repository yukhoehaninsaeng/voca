const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../js/core.js');

const context={};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(require.resolve('../js/data.js'),'utf8')}\nthis.DATA={TOEIC_PARTS,CUSTOM_CARDS};`,context);
const {TOEIC_PARTS,CUSTOM_CARDS}=context.DATA;
const base={words:[{word:'Lead',meaning:'이끌다'},{word:'lead',meaning:'납'}],sents:[{en:'I agree.',ko:'동의합니다.'}],toeicParts:TOEIC_PARTS,customCards:CUSTOM_CARDS};
const catalog=Core.buildCatalog(base);
function memoryStorage(initial={}){const map=new Map(Object.entries(initial));return{get length(){return map.size;},key:index=>[...map.keys()][index]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),clear:()=>map.clear()};}

test('TOEIC와 정적 카드 데이터 수를 고정한다',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(TOEIC_PARTS).map(([key,value])=>[key,value.length])),{p2:73,p3:42,p4:29,p5:50});
  assert.equal(Object.values(TOEIC_PARTS).flat().length,194);
  assert.deepEqual({word:CUSTOM_CARDS.filter(card=>card.type==='word').length,mistake:CUSTOM_CARDS.filter(card=>card.type==='mistake').length,sent:CUSTOM_CARDS.filter(card=>card.type==='sent').length},{word:10,mistake:1,sent:0});
});

test('Item ID는 순서와 앞 항목 삽입에 영향받지 않는다',()=>{
  const reordered=Core.buildCatalog({...base,words:[{word:'new',meaning:'새로운'},...base.words].reverse()});
  catalog.items.forEach(item=>{const same=reordered.items.find(candidate=>candidate.canonicalKey===item.canonicalKey);assert.equal(same?.id,item.id);});
});

test('같은 Item의 Source union은 중복을 제거한다',()=>{
  const duplicate=Core.buildCatalog({words:[{word:'stroll',meaning:'한가롭게 거닐다, 산책하다'}],customCards:CUSTOM_CARDS});
  assert.equal(Core.selectItems(['mine_words','vocab_core140'],duplicate).filter(item=>item.en==='stroll').length,1);
});

test('같은 영문이어도 뜻이 다르면 ID가 다르다',()=>{
  assert.notEqual(catalog.items.find(item=>item.ko==='이끌다').id,catalog.items.find(item=>item.ko==='납').id);
});

test('해시 충돌은 조용히 합치지 않고 감지한다',()=>{
  const registry=Core.createRegistry(()=>'same');registry.add('word','one','하나');assert.throws(()=>registry.add('word','two','둘'),/해시 충돌/);
});

test('P3 오답은 itemId로 기록되어 P4의 다른 문장에 붙지 않는다',()=>{
  const p3=Core.selectItems(['toeic_p3'],catalog),p4Ids=new Set(Core.selectItems(['toeic_p4'],catalog).map(item=>item.id)),exclusive=p3.find(item=>!p4Ids.has(item.id));assert.ok(exclusive);
  const state={progress:{},events:[]};Core.recordStudyEvent(state,{itemId:exclusive.id,sourceIds:['toeic_p3'],mode:'blank',correct:false});
  assert.equal(Core.selectItems(['toeic_p4'],catalog,state.progress).some(item=>item.id===exclusive.id),false);
});

test('선택, Progress, 음성 통계가 새 Repository에서 유지된다',()=>{
  const storage=memoryStorage(),repository=new Core.LocalStorageRepository(storage),item=Core.selectItems(['mine_sentences'],catalog)[0],state={progress:{},events:[]};
  Core.recordStudyEvent(state,{itemId:item.id,sourceIds:['mine_sentences'],mode:'speak',correct:true,ts:new Date(2026,9,2,12).getTime()});repository.saveSnapshot({...state,selection:{sourceIds:['mine_sentences'],mode:'speak'}});
  const restored=new Core.LocalStorageRepository(storage).loadSnapshot();assert.deepEqual(restored.selection,{sourceIds:['mine_sentences'],mode:'speak'});assert.equal(restored.progress[Core.progressKey(item.id,'production')].reps,1);assert.deepEqual(Core.selectTodayStats(restored.events,'2026-10-02'),{attempts:1,correct:1,accuracy:100,uniqueItems:1});
});

test('중간 사용자 단어 삭제 후에도 다른 Item Progress는 유지된다',()=>{
  const target=catalog.items.find(item=>item.ko==='납'),progress={[target.id]:{state:'review',reps:2,lapses:1,dueAt:0}},after=Core.buildCatalog({...base,words:[base.words[1]]});
  assert.equal(after.items.find(item=>item.ko==='납').id,target.id);assert.equal(progress[target.id].reps,2);
});

test('악성 사용자 문자열은 데이터로 보존되며 ID 계약을 벗어나지 않는다',()=>{
  const value='<img onerror=globalThis.pwned=true>',result=Core.buildCatalog({words:[{word:value,meaning:'test'}]});assert.equal(result.items[0].en,value);assert.equal(result.items[0].id,Core.itemIdFor('word',value,'test').id);
  assert.equal(Core.escapeHtml(value),'&lt;img onerror=globalThis.pwned=true&gt;');
});

test('v1 백업과 마이그레이션은 원본을 보존하고 충돌을 보고한다',()=>{
  const storage=memoryStorage({'vm-words':JSON.stringify(base.words),'vm-sents':JSON.stringify(base.sents),'vm-errCount':JSON.stringify({1:2,__w__lead:3})}),report=Core.migrationReport(storage,catalog,{words:base.words,sents:base.sents,errCount:{1:2,__w__lead:3},sErrCount:{}});
  assert.equal(storage.getItem('vm-backup-v1-words'),JSON.stringify(base.words));assert.equal(storage.getItem('vm-words'),JSON.stringify(base.words));assert.equal(report.conflicts.length,1);assert.ok(report.unrecoverable.includes('toeicErrCount'));
});

test('JSON 백업은 초기화 후 사용자 Progress와 이벤트를 복원한다',()=>{
  const storage=memoryStorage(),repository=new Core.LocalStorageRepository(storage),item=catalog.items.find(entry=>entry.ko==='납'),snapshot={progress:{[item.id]:{state:'review',reps:3,lapses:1,streak:1,intervalDays:2,dueAt:123}},events:[],selection:{sourceIds:['mine_words'],mode:'flash'}};
  Core.recordStudyEvent(snapshot,{itemId:item.id,sourceIds:['mine_words'],mode:'flash',correct:true});repository.saveSnapshot(snapshot);const report=repository.previewImport(repository.exportJson(catalog),catalog);assert.equal(report.valid,true);
  repository.saveSnapshot({progress:{},events:[],selection:null});const restored=repository.applyImport(report,catalog,{merge:false});assert.equal(Object.keys(restored.progress).length,2);assert.equal(restored.events.length,1);assert.deepEqual(restored.selection,snapshot.selection);
});

test('평가는 능력별로 분리되고 중립 결과는 진도와 정확도를 바꾸지 않는다',()=>{
  const item=catalog.items[0],state={progress:{},events:[]};
  Core.recordStudyEvent(state,{itemId:item.id,mode:'quiz',correct:true,id:'recognition'});
  Core.recordStudyEvent(state,{itemId:item.id,mode:'speak',correct:null,rating:'grading_failed',id:'failure'});
  assert.ok(state.progress[Core.progressKey(item.id,'recognition')]);
  assert.equal(state.progress[Core.progressKey(item.id,'production')],undefined);
  assert.deepEqual(Core.selectTodayStats(state.events),{attempts:1,correct:1,accuracy:100,uniqueItems:1});
});

test('반복 오답 뒤 한 번 정답은 mastered가 아니며 mastered도 due를 유지한다',()=>{
  const item=catalog.items[0],state={progress:{},events:[]};
  for(let i=0;i<4;i++)Core.recordStudyEvent(state,{itemId:item.id,mode:'type',correct:false,id:`wrong-${i}`,localDate:'2026-10-02',ts:i});
  Core.recordStudyEvent(state,{itemId:item.id,mode:'type',correct:true,id:'right',localDate:'2026-10-02',ts:10});
  const progress=state.progress[Core.progressKey(item.id,'recall')];assert.equal(progress.state,'review');assert.equal(progress.successes,1);assert.equal(progress.lapses,4);
  progress.state='mastered';progress.dueAt=0;assert.equal(Core.selectCounts([item],state.progress,1).due,1);
});

test('Again Hard Good Easy는 서로 다른 설명 가능한 일정을 만든다',()=>{
  const old={intervalDays:10,successes:3,lapses:0};
  assert.equal(Core.scheduleProgress(old,'again','2026-10-02',{now:0}).intervalDays,0);
  assert.equal(Core.scheduleProgress(old,'hard','2026-10-02',{now:0}).intervalDays,12);
  assert.equal(Core.scheduleProgress(old,'good','2026-10-02',{now:0}).intervalDays,20);
  assert.equal(Core.scheduleProgress(old,'easy','2026-10-02',{now:0}).intervalDays,25);
});

test('오늘 계획은 재현 가능하고 상한과 5분 규칙을 지킨다',()=>{
  const progress={};catalog.items.slice(0,100).forEach(item=>progress[Core.progressKey(item.id,'recall')]={state:'review',dueDate:'2026-10-01',lapses:1,intervalDays:1});
  const input={catalog,progress,profile:{dailyMinutes:15},localDate:'2026-10-02',timezone:'Asia/Seoul',seed:'fixed'};
  const first=Core.createDailyPlan(input),second=Core.createDailyPlan(input);assert.deepEqual(first,second);assert.equal(first.counts.review,10);assert.equal(first.counts.new,0);assert.equal(first.remainingReviewCount,90);
  const short=Core.createDailyPlan({...input,budgetMinutes:5});assert.equal(short.counts.review,5);assert.equal(short.counts.new,0);
  const twenty=Core.createDailyPlan({...input,progress:{},profile:{dailyMinutes:15,dailyItemLimit:20}});assert.equal(twenty.steps.length,20);assert.equal(twenty.counts.new,20);assert.equal(twenty.itemLimit,20);
});

test('세션 복구와 attemptId 멱등 제출이 동작한다',()=>{
  const plan=Core.createDailyPlan({catalog,progress:{},profile:{dailyMinutes:15},localDate:'2026-10-02',seed:'fixed'}),session=Core.createSession(plan),task=plan.steps[0];
  assert.equal(Core.createSession(plan,session),session);assert.equal(Core.submitSessionAttempt(session,{taskId:task.taskId,attemptId:'attempt-1',eventId:'event-1'}),true);assert.equal(Core.submitSessionAttempt(session,{taskId:task.taskId,attemptId:'attempt-1',eventId:'event-1'}),false);assert.equal(session.cursor,1);
});

test('가져오기는 변조 데이터와 저장 실패를 거부한다',()=>{
  const envelope=Core.exportEnvelope(catalog,{progress:{},events:[]},null);envelope.items[0].en='tampered';assert.equal(Core.inspectImport(envelope,catalog).valid,false);
  const map=new Map();let writes=0;const broken={getItem:key=>map.get(key)??null,setItem:(key,value)=>{if(++writes===2)throw new Error('quota');map.set(key,String(value));},removeItem:key=>map.delete(key)};assert.throws(()=>new Core.LocalStorageRepository(broken).saveSnapshot({progress:{a:1},events:[],selection:null}),/quota/);assert.equal(broken.getItem('vm-progress-v2'),null);
});

test('마이페이지 지표는 공부한 표현, 숙련 표현, 연속일과 최근 정확도를 계산한다',()=>{
  const progress={'w:a::recall':{state:'mastered'},'w:b::recognition':{state:'review'}},events=[
    {itemId:'w:a',localDate:'2026-10-02',correct:true},{itemId:'w:a',localDate:'2026-10-01',correct:false},{itemId:'w:b',localDate:'2026-10-01',correct:true},{itemId:'w:c',localDate:'2026-09-20',correct:true},{itemId:'w:d',localDate:'2026-10-02',correct:null}
  ];
  assert.deepEqual(Core.selectLearningMetrics(events,progress,'2026-10-02'),{studiedItems:3,masteredItems:1,totalAttempts:4,totalCorrect:3,studyDays:3,currentStreak:2,recentAttempts:3,recentAccuracy:67});
});
