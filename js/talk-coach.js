/* Conversation feedback and local spaced practice queue. Never stores API keys. */
(function(){
 const KEY='vm-talk-review-v1', HISTORY='vm-talk-sessions-v1';
 const $=id=>document.getElementById(id);
 const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key));return Array.isArray(value)?value:fallback;}catch(e){return fallback;}};
 const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){return false;}};
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 const intervals=[1,3,7,14,30];
 const today=()=>new Date().toISOString().slice(0,10);
 const dueDate=days=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);};
 function queuePractice(items){
  const queue=read(KEY,[]),existing=new Set(queue.map(x=>x.en.toLowerCase().trim()));
  items.forEach(x=>{if(x?.en&&x?.ko&&!existing.has(x.en.toLowerCase().trim())){queue.push({id:Date.now()+'-'+queue.length,en:x.en.slice(0,350),ko:x.ko.slice(0,350),level:0,due:today(),created:Date.now()});existing.add(x.en.toLowerCase().trim());}});
  write(KEY,queue.slice(-250));renderDue();
 }
 function renderDue(){
  const due=read(KEY,[]).filter(x=>x.due<=today());const node=$('talk-review-due');
  if(!node)return;
  node.replaceChildren();
  node.append(el('strong','AI 회화에서 복습할 표현: '+due.length+'개'));
  if(!due.length){node.append(el('p','복습할 표현이 없어요.'));return;}
  due.slice(0,5).forEach(x=>{
   const row=el('div',undefined,'talk-review-row');row.append(el('div',x.ko+' · '+x.en));
   const btn=el('button','기억했어요','btn');btn.type='button';btn.addEventListener('click',()=>{const q=read(KEY,[]);const found=q.find(y=>y.id===x.id);if(found){found.level=Math.min(found.level+1,intervals.length-1);found.due=dueDate(intervals[found.level]);write(KEY,q);renderDue();}});row.append(btn);node.append(row);
  });
 }
 function renderConversation(section,history){
  section.append(el('h4','전체 대화 기록'));
  const transcript=el('div',undefined,'talk-transcript-history');
  history.forEach((m,index)=>{
   if(!['user','assistant'].includes(m.role)||!m.content)return;
   const line=el('div',undefined,'talk-history-line '+m.role);
   line.append(el('strong',m.role==='user'?'나':'AI 친구'),el('p',m.content));
   transcript.append(line);
  });
  section.append(transcript);
 }
 function renderReport(section,data){
  if(!data)return;
  section.append(el('h4','AI 피드백'));
  section.append(el('p',data.summary||'대화를 완료했어요.'));
  if(data.strengths?.length){section.append(el('h4','잘한 점'));data.strengths.forEach(x=>section.append(el('p','✓ '+x)));}
  if(data.corrections?.length){section.append(el('h4','자연스러운 표현으로 고치기'));data.corrections.forEach(x=>{const row=el('div',undefined,'talk-correction');row.append(el('p','내 표현: '+x.original),el('p','추천 표현: '+x.corrected),el('small',x.reason));section.append(row);});}
  else section.append(el('p','AI가 발견한 뚜렷한 문법 오류가 없어요.'));
  if(data.nextPractice?.length){section.append(el('h4','다음에 연습할 문장'));data.nextPractice.forEach(x=>section.append(el('p',x.en+' — '+x.ko)));}
 }
 function showSession(record,section){
  section.hidden=false;section.dataset.sessionId=record.id;section.replaceChildren();
  section.append(el('h3','회화 기록 · 피드백'));
  section.append(el('p',new Date(record.date).toLocaleString('ko-KR')+' · '+record.topic+' · 내가 말한 횟수 '+record.turns));
  renderConversation(section,record.history||[]);
  if(record.feedback)renderReport(section,record.feedback);
  else section.append(el('p',record.error||'AI 피드백을 기다리고 있어요.'));
  const dueBox=el('div');dueBox.id='talk-review-due';section.append(dueBox);renderDue();
 }
 window.talkShowPast=function(index){
  const records=read(HISTORY,[]),record=records[index],section=$('talk-feedback');
  if(record&&section){showSession(record,section);section.scrollIntoView({behavior:'smooth',block:'start'});}
 };
 window.talkAnalyze=async function(history,topic){
  const section=$('talk-feedback');if(!section)return;
  const turns=history.filter(m=>m.role==='user'&&m.content?.trim());
  if(!turns.length){section.hidden=false;section.replaceChildren();section.append(el('p','먼저 영어로 대화해 주세요.'));return;}
  const record={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),date:new Date().toISOString(),topic,turns:turns.length,history:history.filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:String(m.content||'').slice(0,700)})),feedback:null,error:'AI가 대화 내용을 분석하고 있어요.'};
  let past=read(HISTORY,[]);past.push(record);write(HISTORY,past.slice(-30));
  showSession(record,section);
  try{
   const response=await fetch('/api/talk-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,history})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'분석 실패');
   record.feedback=data;record.error='';queuePractice(data.nextPractice||[]);
  }catch(e){record.error='AI 피드백을 가져오지 못했어요. 브라우저 AI 설정과 네트워크를 확인해 주세요. 대화 기록은 저장됐습니다.';}
  past=read(HISTORY,[]);const index=past.findIndex(x=>x.id===record.id);
  if(index!==-1){past[index]=record;write(HISTORY,past);}
  if(section.dataset.sessionId===record.id||!section.dataset.sessionId){showSession(record,section);}
  window.talkRenderHistory?.();
 };
 window.talkRenderHistory=function(){
  const container=$('talk-history-list');if(!container)return;
  container.replaceChildren();
  const past=read(HISTORY,[]);
  if(!past.length){container.append(el('p','아직 저장된 대화가 없어요.'));return;}
  past.slice().reverse().forEach((record,i)=>{
   const index=past.length-1-i;
   const button=el('button',new Date(record.date).toLocaleString('ko-KR')+' · '+record.topic+' · '+record.turns+'회 말하기','btn talk-history-button');
   button.type='button';button.addEventListener('click',()=>window.talkShowPast(index));container.append(button);
  });
 };
 window.addEventListener('DOMContentLoaded',()=>window.talkRenderHistory());
 const oldReset=window.talkReset;window.talkReset=function(){const feedback=$('talk-feedback');if(feedback){feedback.hidden=true;feedback.replaceChildren();}oldReset?.();};
})();
