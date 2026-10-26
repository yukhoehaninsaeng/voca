/* Phase 4: connect live conversation with personalized speaking practice. */
(function(){
 'use strict';
 const KEY='vm-conversation-patterns-v1';
 const patterns=[
  {id:'usually-weekend',pattern:'I usually ...',test:/\b(usually|normally)\b/i},
  {id:'cook-together',pattern:'We often ...',test:/\boften\b/i},
  {id:'monday-tired',pattern:'I was ... because ...',test:/\b(because|since)\b/i},
  {id:'weekend-over',pattern:'I guess ...',test:/\b(i guess|maybe|i think)\b/i},
  {id:'after-work',pattern:'... after ...',test:/\bafter\b/i},
  {id:'date-food',pattern:'I went ... and we ...',test:/\b(went|go)\b.*\b(and|with)\b/i},
  {id:'work-late',pattern:'I had to ...',test:/\bhad to\b/i},
  {id:'weekend-movies',pattern:'Sometimes we ...',test:/\bsometimes\b/i},
  {id:'coffee-usually',pattern:'I usually ...',test:/\b(usually|normally)\b/i},
  {id:'busy-meeting',pattern:'... because ...',test:/\b(because|since)\b/i}
 ];
 const $=id=>document.getElementById(id);
 function render(){
  const el=$('talk-pattern-insights');if(!el)return;
  let sessions=[];try{sessions=JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){}
  if(!Array.isArray(sessions)||!sessions.length){el.textContent='대화를 종료하면 실제로 사용한 표현을 분석해 맞춤 복습과 연결해요.';return;}
  const latest=sessions[sessions.length-1];
  el.replaceChildren();
  const heading=document.createElement('strong');heading.textContent='최근 회화 · '+latest.turns+'번 답변';el.append(heading);
  const desc=document.createElement('p');desc.textContent=latest.used.length?'발견한 표현: '+latest.used.join(' / '):'이번 대화에서는 등록된 핵심 패턴을 찾지 못했어요. 다음에 한 가지를 의식해서 사용해 보세요.';el.append(desc);
  const btn=document.createElement('button');btn.className='btn';btn.type='button';btn.textContent='오늘의 맞춤 문장으로 복습';
  btn.addEventListener('click',()=>{if(typeof window.go==='function')window.go('retrieval');window.VocaSpeakingPlan?.render?.();});el.append(btn);
 }
 window.addEventListener('voca-conversation-finished',event=>{
  const h=Array.isArray(event.detail?.history)?event.detail.history:[];
  const user=h.filter(m=>m.role==='user').map(m=>String(m.content||''));
  if(!user.length)return;
  const used=[...new Set(patterns.filter(p=>user.some(t=>p.test.test(t))).map(p=>p.pattern))];
  let sessions=[];try{sessions=JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){}
  if(!Array.isArray(sessions))sessions=[];
  sessions.push({at:new Date().toISOString(),topic:String(event.detail?.topic||''),turns:user.length,used});
  try{localStorage.setItem(KEY,JSON.stringify(sessions.slice(-60)));}catch(e){}
  window.dispatchEvent(new Event('voca-speaking-progress'));render();
 });
 window.addEventListener('DOMContentLoaded',render);
})();
