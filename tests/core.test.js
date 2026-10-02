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
  const restored=new Core.LocalStorageRepository(storage).loadSnapshot();assert.deepEqual(restored.selection,{sourceIds:['mine_sentences'],mode:'speak'});assert.equal(restored.progress[item.id].reps,1);assert.deepEqual(Core.selectTodayStats(restored.events,'2026-10-02'),{attempts:1,correct:1,accuracy:100,uniqueItems:1});
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
  repository.saveSnapshot({progress:{},events:[],selection:null});const restored=repository.applyImport(report,catalog,{merge:false});assert.equal(Object.keys(restored.progress).length,1);assert.equal(restored.events.length,1);assert.deepEqual(restored.selection,snapshot.selection);
});

test('가져오기는 변조 데이터와 저장 실패를 거부한다',()=>{
  const envelope=Core.exportEnvelope(catalog,{progress:{},events:[]},null);envelope.items[0].en='tampered';assert.equal(Core.inspectImport(envelope,catalog).valid,false);
  const map=new Map();let writes=0;const broken={getItem:key=>map.get(key)??null,setItem:(key,value)=>{if(++writes===2)throw new Error('quota');map.set(key,String(value));},removeItem:key=>map.delete(key)};assert.throws(()=>new Core.LocalStorageRepository(broken).saveSnapshot({progress:{a:1},events:[],selection:null}),/quota/);assert.equal(broken.getItem('vm-progress-v2'),null);
});
