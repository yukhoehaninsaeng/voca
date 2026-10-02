const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Element {
  constructor(id=''){this.id=id;this.style={};this.value='';this.textContent='';this.innerHTML='';this.disabled=false;this.dataset={};this.children=[];this.offsetWidth=340;this.offsetHeight=120;this.listeners={};this.classList={add(){},remove(){},toggle(){},contains(){return false;}};}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);} dispatchEvent(event){event.preventDefault??=()=>{};for(const handler of this.listeners[event.type]||[])handler(event);return true;} append(...children){this.children.push(...children);} appendChild(child){this.children.push(child);} replaceChildren(...children){this.children=children;} focus(){} click(){}
  getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});}
}
function boot(){
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const values=new Map(),localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const document={getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,createElement:tag=>new Element(tag),body:element('body')};
  const context={console,document,localStorage,navigator:{userAgent:'test'},Intl,Date,Math,JSON,setTimeout:callback=>callback(),clearTimeout(){},alert(){},confirm:()=>true,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},speechSynthesis:null,SpeechSynthesisUtterance:function(){},scrollTo(){}};
  context.window=context;context.globalThis=context;vm.createContext(context);
  for(const file of ['js/data.js','js/core.js','js/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  return{context,elements,localStorage};
}

test('앱 초기화와 주요 버튼 핸들러가 런타임 오류 없이 동작한다',()=>{
  const {context,elements,localStorage}=boot();
  context.document.getElementById('profileGoal').value='daily';context.document.getElementById('profileMinutes').value='10';context.document.getElementById('profileLevel').value='beginner';context.document.getElementById('profileInterests').value='여행, 면접';
  assert.equal(elements.get('apiModal').style.display,'none');
  assert.equal(elements.get('onboardingModal').style.display,'flex');
  assert.doesNotThrow(()=>context.document.getElementById('onboardingForm').dispatchEvent({type:'submit',preventDefault(){}}));
  for(const source of ["go('input')","switchInputMode('sent')","go('learn')","startToday()","showApiModal()"])assert.doesNotThrow(()=>vm.runInContext(source,context),source);
  const profile=JSON.parse(localStorage.getItem('vm-profile-v2'));assert.deepEqual({goal:profile.goal,dailyMinutes:profile.dailyMinutes,level:profile.level,interests:Array.from(profile.interests)},{goal:'daily',dailyMinutes:10,level:'beginner',interests:['여행','면접']});
  assert.equal(elements.get('onboardingModal').style.display,'none');
  const html=fs.readFileSync('index.html','utf8'),handlers=[...html.matchAll(/onclick="([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]);
  for(const handler of new Set(handlers))assert.equal(vm.runInContext(`typeof ${handler}`,context),'function',`${handler} 버튼 핸들러`);
});

test('손상된 localStorage 값이 전체 앱 초기화를 막지 않는다',()=>{
  const {context,localStorage}=boot();localStorage.setItem('vm-events-v2','not-json');
  const repository=new context.VocabCore.LocalStorageRepository(localStorage);
  assert.deepEqual(Array.from(repository.loadSnapshot().events),[]);
});
