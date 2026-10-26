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
 window.talkAnalyze=async function(history,topic){
  const section=$('talk-feedback');if(!section)return;
  section.hidden=false;section.replaceChildren();section.append(el('h3','대화 피드백'));
  const turns=history.filter(m=>m.role==='user'&&m.content?.trim());
  if(!turns.length){section.append(el('p','먼저 영어로 대화한 다음 종료해 주세요.'));renderDue();return;}
  section.append(el('p','AI가 문장과 문법을 분석하고 있어요. 발음 평가는 포함되지 않습니다.'));
  try{
   const response=await fetch('/api/talk-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,history})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'분석 실패');
   section.replaceChildren();section.append(el('h3','오늘의 회화 피드백'));section.append(el('p',data.summary||'대화를 완료했어요.'));
   if(data.strengths?.length){section.append(el('h4','잘한 점'));data.strengths.forEach(x=>section.append(el('p','✓ '+x)));}
   if(data.corrections?.length){section.append(el('h4','다듬으면 좋은 표현'));data.corrections.forEach(x=>{const row=el('div',undefined,'talk-correction');row.append(el('p','내 표현: '+x.original),el('p','추천 표현: '+x.corrected),el('small',x.reason));section.append(row);});}
   else section.append(el('p','이번 대화에서는 뚜렷한 문법 오류를 찾지 못했어요.'));
   queuePractice(data.nextPractice||[]);
   const past=read(HISTORY,[]);past.push({date:new Date().toISOString(),topic,turns:turns.length,summary:String(data.summary||'').slice(0,450)});write(HISTORY,past.slice(-30));
   section.append(el('p','추천 표현을 별도의 회화 복습함에 저장했어요.'));
   const dueBox=el('div');dueBox.id='talk-review-due';section.append(dueBox);renderDue();
  }catch(e){section.replaceChildren();section.append(el('h3','대화를 마쳤어요'));section.append(el('p','AI 분석을 연결하지 못했어요. Vercel OPENAI_API_KEY 설정을 확인해 주세요. 대화 내용은 자동으로 서버에 저장되지 않습니다.'));renderDue();}
 };
 const oldReset=window.talkReset;window.talkReset=function(){const feedback=$('talk-feedback');if(feedback){feedback.hidden=true;feedback.replaceChildren();}oldReset?.();};
})();
