/* VocaMate Phase 3: personalized daily practice and progress. Local, explainable scoring. */
(function(){
 'use strict';
 const R='vm-sentence-retrieval-v1',E='vm-sentence-expansion-v1',P='vm-speaking-plan-v1',DAY=86400000;
 const $=id=>document.getElementById(id);
 const catalog=[
  ['usually-weekend','I usually ...','주말·연애'],['cook-together','We often ...','일상·요리'],
  ['monday-tired','I was ... because ...','직장·감정'],['weekend-over','I guess ... because ...','이유·감정'],
  ['after-work','I ... after ...','직장·일상'],['date-food','I went ... and we ...','주말·연애'],
  ['work-late','I had to ...','직장'],['weekend-movies','Sometimes we ...','주말'],
  ['coffee-usually','I usually ...','일상'],['busy-meeting','I was ... because ...','직장']
 ].map(([id,pattern,topic])=>({id,pattern,topic}));
 const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback;}catch(e){return fallback;}};
 const localDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const attempts=()=>{const v=read(R,{}).attempts;return Array.isArray(v)?v.filter(a=>a&&catalog.some(c=>c.id===a.id)):[];};
 const expansions=()=>{const v=read(E,[]);return Array.isArray(v)?v.filter(a=>a&&a.focus):[];};
 const cards=()=>read(R,{}).cards||{};
 function metrics(){
  const a=attempts(),e=expansions(),c=cards(),last=a.slice(-30),independent=last.filter(x=>x.independent).length;
  const times=last.filter(x=>Number.isFinite(x.elapsedMs)&&x.elapsedMs>0&&x.elapsedMs<180000).map(x=>x.elapsedMs).sort((x,y)=>x-y);
  const median=times.length?times[Math.floor(times.length/2)]:null;
  return {attempts:a,expansions:e,cards:c,independentRate:last.length?Math.round(independent/last.length*100):null,median,completed:catalog.filter(t=>(c[t.id]?.level||0)>=3).length,due:catalog.filter(t=>c[t.id]&&Number(c[t.id].due)<=Date.now()).length};
 }
 function score(task,m){
  const logs=m.attempts.filter(a=>a.id===task.id).slice(-5),card=m.cards[task.id],now=Date.now();
  if(!logs.length)return {score:70,reason:'아직 연습하지 않은 표현'};
  const misses=logs.filter(a=>!a.independent).length;
  const hints=logs.filter(a=>Number(a.hintLevel)>0).length;
  const overdue=card&&Number(card.due)<=now?30:0;
  const avg=logs.reduce((n,a)=>n+Math.min(5,Math.max(0,Number(a.hintLevel)||0)),0)/logs.length;
  const recency=logs.length&&Date.parse(logs[logs.length-1].at)>now-DAY? -10:0;
  return {score:10+misses*12+hints*8+avg*6+overdue+recency,reason:overdue?'복습 예정인 표현':misses?'힌트 없이 말하기 어려웠던 표현':hints?'힌트를 사용한 표현':'다른 상황에서 다시 활용할 표현'};
 }
 function build(){
  const m=metrics();
  const ranked=catalog.map(c=>({...c,...score(c,m)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return {date:localDate(),ids:ranked.slice(0,5).map(x=>x.id),createdAt:new Date().toISOString()};
 }
 function plan(){
  const existing=read(P,null);
  if(existing?.date===localDate()&&Array.isArray(existing.ids)&&existing.ids.length===5&&existing.ids.every(id=>catalog.some(c=>c.id===id)))return existing;
  const fresh=build();try{localStorage.setItem(P,JSON.stringify(fresh));}catch(e){}return fresh;
 }
 function render(){
  const host=$('speaking-plan');if(!host)return;
  const m=metrics(),p=plan(),ranked=catalog.map(c=>({...c,...score(c,m)}));
  const list=p.ids.map(id=>ranked.find(c=>c.id===id)).filter(Boolean);
  const stats=$('speaking-progress-stats');
  stats.replaceChildren();
  const blocks=[
   ['연습 횟수',String(m.attempts.length)],
   ['힌트 없이 성공',m.independentRate===null?'기록 없음':m.independentRate+'%'],
   ['중앙 응답 시간',m.median===null?'기록 없음':(m.median/1000).toFixed(1)+'초'],
   ['숙달 패턴',m.completed+'/'+catalog.length]
  ];
  blocks.forEach(([label,value])=>{const el=document.createElement('div');el.className='speaking-metric';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;el.append(small,strong);stats.append(el);});
  const listEl=$('speaking-daily-list');listEl.replaceChildren();
  list.forEach((t,i)=>{const li=document.createElement('li');const title=document.createElement('strong');title.textContent=(i+1)+'. '+t.pattern+' · '+t.topic;const why=document.createElement('small');why.textContent=t.reason;li.append(title,why);listEl.append(li);});
  const weak=ranked.filter(x=>m.attempts.some(a=>a.id===x.id&&!a.independent)).sort((a,b)=>b.score-a.score).slice(0,3);
  $('speaking-weakness').textContent=weak.length?'최근 막힌 표현: '+weak.map(x=>x.pattern).join(' / '):'학습 기록이 쌓이면 자주 막히는 패턴을 알려드려요.';
  const expanded=m.expansions.reduce((acc,e)=>(acc[e.focus]=(acc[e.focus]||0)+1,acc),{});
  $('speaking-expansion-stats').textContent='문장 확장: 이유 '+(expanded.reason||0)+'회 · 상세 '+(expanded.detail||0)+'회 · 감정 '+(expanded.feeling||0)+'회';
  $('speaking-plan-date').textContent=p.date+' 추천 · 5문장';
 }
 function start(){
  const p=plan(),m=metrics(),target=p.ids.map(id=>catalog.find(c=>c.id===id)).filter(Boolean).sort((a,b)=>score(b,m).score-score(a,m).score)[0];
  if(!target)return;
  window.dispatchEvent(new CustomEvent('voca-retrieval-select',{detail:{id:target.id}}));
  if(typeof window.go==='function')window.go('retrieval');
  $('retrieval-prompt')?.scrollIntoView?.({behavior:'smooth',block:'center'});
 }
 function refresh(){try{localStorage.removeItem(P);}catch(e){}render();}
 window.VocaSpeakingPlan={plan,metrics,refresh,render};
 window.addEventListener('DOMContentLoaded',()=>{
  if(!$('speaking-plan'))return;
  $('speaking-plan-start').addEventListener('click',start);
  $('speaking-plan-refresh').addEventListener('click',refresh);
  window.addEventListener('voca-speaking-progress',render);
  window.addEventListener('storage',e=>{if([R,E,P].includes(e.key))render();});
  render();
 });
})();
