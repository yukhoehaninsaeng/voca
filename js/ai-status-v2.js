/* Single source of truth for BYOK AI status; never infer connectivity from a stored key. */
(function(){
 const VERIFIED='vm-ai-verified-v1';
 const badge=()=>document.getElementById('apiStatus');
 function active(){return window.VocaUser?.active?.()||{provider:'openai',key:'',model:''};}
 function fingerprint(){const a=active();return a.provider+':'+a.model+':'+a.key.length+':'+a.key.slice(-6);}
 function verified(){try{return JSON.parse(sessionStorage.getItem(VERIFIED));}catch(e){return null;}}
 function update(){
  const b=badge();if(!b)return;
  const a=active(),ok=Boolean(a.key),v=verified(),isVerified=ok&&v?.fingerprint===fingerprint();
  b.textContent=!ok?'AI OFF':isVerified?'AI ON':'AI 설정됨';
  b.classList.toggle('connected',Boolean(isVerified));
  b.title=!ok?'AI 키가 없습니다. 마이에서 등록하세요.':isVerified?'실제 AI 연결 테스트 성공 ('+a.provider+')':'키는 저장되었지만 연결은 아직 검증되지 않았습니다.';
 }
 async function check(){
  const a=active(),msg=document.getElementById('voca-data-status'),button=document.getElementById('voca-test-ai');
  if(!a.key){if(msg)msg.textContent='선택한 제공업체의 API 키를 먼저 저장해 주세요.';update();return;}
  if(button)button.disabled=true;
  if(msg)msg.textContent='실제 AI 연결을 확인 중입니다. 소량의 API 사용료가 발생할 수 있어요.';
  try{
   const result=await window.VocaUser.ai('chat',{topic:'connection check',history:[{role:'user',content:'Reply with one short greeting.'}]});
   if(!result.reply)throw Error('빈 응답');
   sessionStorage.setItem(VERIFIED,JSON.stringify({fingerprint:fingerprint(),time:Date.now()}));
   if(msg)msg.textContent=a.provider+' 연결 확인 성공! AI ON으로 표시됩니다.';
  }catch(e){
   sessionStorage.removeItem(VERIFIED);
   if(msg)msg.textContent='AI 연결 실패: '+e.message+' · API 키, 모델명, 결제 상태를 확인해 주세요.';
  }finally{if(button)button.disabled=false;update();}
 }
 window.updateApiStatus=update;
 window.vocaTestAiConnection=check;
 window.addEventListener('voca-ai-settings-changed',()=>{sessionStorage.removeItem(VERIFIED);update();});
 window.addEventListener('DOMContentLoaded',()=>{update();document.getElementById('voca-test-ai')?.addEventListener('click',check);});
 window.addEventListener('pageshow',update);
})();