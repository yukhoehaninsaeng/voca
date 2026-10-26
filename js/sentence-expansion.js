/* Phase 2: AI-guided sentence expansion after Phase 1 response. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),KEY='vm-sentence-expansion-v1';
 const focuses=[{id:'reason',label:'이유',question:'왜 그렇게 생각하거나 행동했나요?',starter:'because ...'},{id:'detail',label:'상세 설명',question:'누구와, 어디서, 무엇을 했는지 더 말해 볼까요?',starter:'We also ...'},{id:'feeling',label:'감정',question:'그때 기분이 어땠나요?',starter:'I felt ...'}];
 let base='',situation='',focusIndex=0,requestId=0,guide=null,attempts=[];
 const status=t=>{$('expansion-status').textContent=t;};
 const save=entry=>{try{const arr=JSON.parse(localStorage.getItem(KEY)||'[]');const list=Array.isArray(arr)?arr:[];list.push(entry);localStorage.setItem(KEY,JSON.stringify(list.slice(-150)));}catch(e){status('저장 공간을 확인해 주세요.');}};
 function reset(){requestId++;base='';guide=null;attempts=[];$('expansion-panel').hidden=true;$('expansion-input').value='';$('expansion-result').hidden=true;$('expansion-result').textContent='';$('expansion-hint').hidden=true;$('expansion-hint').textContent='';$('expansion-next').hidden=true;$('expansion-start').disabled=false;}
 function focus(){return focuses[focusIndex];}
 async function prepare(){
  if(!base)return;
  $('expansion-submit').disabled=false;
  const id=++requestId;guide=null;$('expansion-input').value='';$('expansion-result').hidden=true;$('expansion-next').hidden=true;$('expansion-hint').hidden=true;
  $('expansion-focus').textContent=focus().label;
  $('expansion-question').textContent=focus().question;
  status('먼저 스스로 한 문장을 덧붙여 보세요.');
  const ai=window.VocaUser?.active?.();
  if(!ai?.key){status('AI 키가 없어 기본 질문으로 연습해요. AI 설정을 하면 맞춤 예시를 받을 수 있어요.');return;}
  const expected=id;
  try{
   const result=await window.VocaUser.ai('expansion',{base,situation,learner:base,focus:focus().id});
   if(expected!==requestId)return;
   if(result.questionKo)$('expansion-question').textContent=result.questionKo;
   guide=result;
   status('AI 질문이 준비됐어요. 먼저 자신의 답변을 만들어 보세요.');
  }catch(e){if(expected===requestId)status('AI 연결이 원활하지 않아 기본 질문으로 연습해요.');}
 }
 function start(){
  const text=$('retrieval-input')?.value?.trim();
  const prompt=$('retrieval-prompt')?.textContent||'';
  if(!text){status('먼저 위에서 기본 문장을 입력해 주세요.');return;}
  base=text;situation=prompt;focusIndex=0;attempts=[];
  $('expansion-panel').hidden=false;$('expansion-start').disabled=true;
  prepare();$('expansion-panel').scrollIntoView?.({behavior:'smooth',block:'nearest'});
 }
 function hint(){
  if(!base)return;
  $('expansion-hint').hidden=false;
  $('expansion-hint').textContent='문장 시작 힌트: '+(guide?.hint||focus().starter);
 }
 function submit(){
  const extra=$('expansion-input').value.trim();
  if(!extra){status('기본 문장에 덧붙일 내용을 영어로 입력해 주세요.');return;}
  $('expansion-submit').disabled=true;
  const item={focus:focus().id,answer:extra,at:new Date().toISOString(),usedHint:!$('expansion-hint').hidden};
  attempts.push(item);
  save({situation,base,...item});
  $('expansion-result').hidden=false;
  $('expansion-result').textContent='내가 만든 답변: '+base+' '+extra+'\n\n'+(guide?.example?'AI 확장 예시: '+guide.example+'\n'+(guide.tipKo||''):'좋아요! 이유·상세 설명·감정을 한 문장씩 더하는 연습을 했어요. AI 키를 연결하면 맞춤 예시를 볼 수 있어요.');
  $('expansion-next').hidden=focusIndex===focuses.length-1;
  status(focusIndex===focuses.length-1?'3가지 확장 훈련 완료! 다른 문장에서도 활용해 보세요.':'좋아요! 다른 방식으로 한 문장 더 확장해 볼까요?');
 }
 function next(){if(focusIndex<focuses.length-1){focusIndex++;prepare();}}
 window.addEventListener('DOMContentLoaded',()=>{
  if(!$('expansion-panel'))return;
  $('expansion-start').addEventListener('click',start);
  $('expansion-hint-button').addEventListener('click',hint);
  $('expansion-submit').addEventListener('click',submit);
  $('expansion-next').addEventListener('click',next);
  $('retrieval-next').addEventListener('click',reset);
  $('retrieval-correct').addEventListener('click',reset);
  $('retrieval-retry').addEventListener('click',reset);
  reset();
 });
})();
