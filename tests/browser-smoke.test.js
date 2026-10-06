const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Element {
  constructor(id=''){this.id=id;this.style={};this.value='';this.textContent='';this.innerHTML='';this.disabled=false;this.dataset={};this.children=[];this.offsetWidth=340;this.offsetHeight=120;this.listeners={};this.classList={add(){},remove(){},toggle(){},contains(){return false;}};}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);} dispatchEvent(event){event.preventDefault??=()=>{};for(const handler of this.listeners[event.type]||[])handler(event);return true;} append(...children){this.children.push(...children);} appendChild(child){this.children.push(child);} replaceChildren(...children){this.children=children;} focus(){} click(){}
  getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});}
}
function boot(initial={}){
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const values=new Map(Object.entries(initial)),localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const document={getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,createElement:tag=>new Element(tag),body:element('body')};
  const context={console,document,localStorage,navigator:{userAgent:'test'},Intl,Date,Math,JSON,setTimeout:callback=>callback(),clearTimeout(){},alert(){},confirm:()=>true,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},speechSynthesis:null,SpeechSynthesisUtterance:function(){},scrollTo(){}};
  context.window=context;context.globalThis=context;vm.createContext(context);
  for(const file of ['js/data.js','js/core.js','js/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  return{context,elements,localStorage};
}

test('앱 초기화와 주요 버튼 핸들러가 런타임 오류 없이 동작한다',()=>{
  const {context,elements,localStorage}=boot();
  context.document.getElementById('profileGoal').value='daily';context.document.getElementById('profileMinutes').value='10';context.document.getElementById('profileItemLimit').value='15';context.document.getElementById('profileLevel').value='beginner';context.document.getElementById('profileInterests').value='여행, 면접';
  assert.equal(context.document.getElementById('apiModal').style.display||'none','none');
  assert.equal(elements.get('onboardingModal').style.display,'flex');
  assert.doesNotThrow(()=>context.document.getElementById('onboardingForm').dispatchEvent({type:'submit',preventDefault(){}}));
  for(const source of ["go('input')","switchInputMode('sent')","go('learn')","go('profile')","startToday()","showApiModal()"])assert.doesNotThrow(()=>vm.runInContext(source,context),source);
  const profile=JSON.parse(localStorage.getItem('vm-profile-v2'));assert.deepEqual({goal:profile.goal,dailyMinutes:profile.dailyMinutes,dailyItemLimit:profile.dailyItemLimit,level:profile.level,interests:Array.from(profile.interests)},{goal:'daily',dailyMinutes:10,dailyItemLimit:15,level:'beginner',interests:['여행','면접']});
  assert.equal(elements.get('onboardingModal').style.display,'none');
  context.document.getElementById('settingsItemLimit').value='20';context.document.getElementById('settingsToeicScore').value='160';context.document.getElementById('profileSettingsForm').dispatchEvent({type:'submit',preventDefault(){}});const updated=JSON.parse(localStorage.getItem('vm-profile-v2'));assert.equal(updated.dailyItemLimit,20);assert.equal(updated.toeicSpeakingScore,160);assert.equal(context.document.getElementById('profile-level-badge').textContent,'AL · 160점');
  const html=fs.readFileSync('index.html','utf8'),handlers=[...html.matchAll(/onclick="([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]);
  for(const handler of new Set(handlers))assert.equal(vm.runInContext(`typeof ${handler}`,context),'function',`${handler} 버튼 핸들러`);
});

test('손상된 localStorage 값이 전체 앱 초기화를 막지 않는다',()=>{
  const {context,localStorage}=boot();localStorage.setItem('vm-events-v2','not-json');
  const repository=new context.VocabCore.LocalStorageRepository(localStorage);
  assert.deepEqual(Array.from(repository.loadSnapshot().events),[]);
});


test('API 키 저장 후 AI 연상법을 요청하고 의미별로 캐시한다',async()=>{
  const {context,localStorage}=boot();let calls=0;
  context.document.getElementById('apiKeyInput').value='sk-ant-test';context.document.getElementById('apiModelInput').value='test-model';
  vm.runInContext('saveApiKey()',context);
  assert.equal(localStorage.getItem('vm-apikey'),'sk-ant-test');assert.equal(localStorage.getItem('vm-ai-model'),'test-model');
  context.fetch=async()=>{calls++;return{ok:true,json:async()=>({content:[{type:'text',text:'{"scene":"공원 장면","memory":"산책을 떠올려요","sentence":"I stroll in the park. | 나는 공원을 거닐어요."}'}]})};};
  const first=await vm.runInContext("getAI('stroll','거닐다')",context),second=await vm.runInContext("getAI('stroll','거닐다')",context);
  assert.equal(first.scene,'공원 장면');assert.equal(second.memory,'산책을 떠올려요');assert.equal(calls,1);assert.ok(localStorage.getItem('vm-ai-cache-v2'));
  const restored=boot({'vm-apikey':'persisted','vm-ai-model':'test-model'});assert.equal(restored.elements.get('apiStatus').textContent,'AI ON');
});

test('영어 발음 버튼은 en-US 음성을 선택해 재생한다',()=>{
  const {context}=boot();let spoken=null,cancelled=false;
  context.speechSynthesis={cancel(){cancelled=true;},getVoices(){return[{name:'Korean',lang:'ko-KR'},{name:'English',lang:'en-US'}];},speak(value){spoken=value;}};
  context.SpeechSynthesisUtterance=function(text){this.text=text;};
  assert.equal(vm.runInContext("speakEnglish('schedule')",context),true);assert.equal(cancelled,true);assert.equal(spoken.text,'schedule');assert.equal(spoken.lang,'en-US');assert.equal(spoken.rate,.85);assert.equal(spoken.voice.name,'English');
});
