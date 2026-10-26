/* Push-to-talk English conversation. Works without camera; AI needs /api/chat configured. */
(function(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recognition=null, busy=false, history=[],topic='daily life',listening=false, sessionId=0;
  let finalized='',interim='',submitWhenStopped=false,manualStop=false,recognitionToken=0;
  const $=id=>document.getElementById(id);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=message=>{if($('talk-status'))$('talk-status').textContent=message;};
  const avatarState=state=>{const avatar=document.querySelector('.talk-avatar');if(avatar)avatar.dataset.state=state;};
  const opening={
    'daily life':'Hi! How was your day today?',
    'food':'Hi! What kind of food do you like?',
    'work':'Hi! What do you usually do at work?',
    'weekend':'Hi! What do you like to do on weekends?',
    'toeic':'Hello! Tell me about your favorite place to visit.'
  };
  function bubble(role,message){
    const log=$('talk-log');if(!log)return;
    const div=document.createElement('div');div.className='talk-bubble '+role;
    div.textContent=message;log.appendChild(div);log.scrollTop=log.scrollHeight;
  }
  function speak(message){
    if(!('speechSynthesis' in window)){status('음성 재생 미지원 · 텍스트를 확인해 주세요.');return;}
    window.speechSynthesis.cancel();
    avatarState('speaking');
    const utterance=new SpeechSynthesisUtterance(message);
    // No synthetic mouth overlay: preserve the supplied character image.
    utterance.lang='en-US';utterance.rate=0.85;utterance.pitch=1;
    utterance.onend=()=>{avatarState('idle');const avatar=document.querySelector('.talk-avatar');if(avatar)avatar.dataset.mouth='closed';};
    utterance.onerror=()=>{avatarState('idle');status('음성 재생이 제한되었어요. 텍스트로 계속 연습할 수 있어요.');};
    window.speechSynthesis.speak(utterance);
  }
  function updateTranscript(){
    const node=$('talk-live-transcript');
    if(node)node.textContent=[finalized,interim].filter(Boolean).join(' ').trim();
  }
  function updateButton(){
    const b=$('talk-mic');if(!b)return;
    b.disabled=busy;
    b.textContent=listening?'✓ 말하기 완료':'🎤 마이크로 말하기';
    b.setAttribute('aria-pressed',String(listening));
  }
  function finishSpeech(){
    if(!recognition||!listening)return;
    manualStop=true;submitWhenStopped=true;
    status('말하기를 마무리하고 있어요...');
    try{recognition.stop();}catch(e){completeSpeech();}
  }
  function completeSpeech(){
    const text=[finalized,interim].filter(Boolean).join(' ').trim();
    listening=false;recognition=null;avatarState('idle');updateButton();
    if(submitWhenStopped&&text)send(text);
    else if(submitWhenStopped)status('인식된 문장이 없어요. 다시 말해 주세요.');
    else if(text)status('음성 인식이 멈췄어요. 마이크를 눌러 이어서 말하거나 텍스트로 입력하세요.');
    submitWhenStopped=false;manualStop=false;finalized='';interim='';
    updateTranscript();
  }
  function begin(){
    if(recognition||busy)return;
    if(!SpeechRecognition){status('이 브라우저는 음성 인식을 지원하지 않아요. 텍스트 입력을 이용해 주세요.');return;}
    window.speechSynthesis?.cancel();
    finalized='';interim='';submitWhenStopped=false;manualStop=false;
    const token=++recognitionToken;
    try{
      const rec=new SpeechRecognition();recognition=rec;
      rec.lang='en-US';rec.interimResults=true;rec.continuous=true;
      rec.onresult=event=>{
        if(token!==recognitionToken)return;
        // Chrome can revise interim hypotheses; final results are rebuilt by index.
        const finals=[],partials=[];
        for(let i=0;i<event.results.length;i++){
          const phrase=event.results[i]?.[0]?.transcript?.trim();
          if(!phrase)continue;
          (event.results[i].isFinal?finals:partials).push(phrase);
        }
        finalized=finals.join(' ');interim=partials.join(' ');updateTranscript();
      };
      rec.onerror=event=>{
        if(token!==recognitionToken)return;
        if(event.error==='not-allowed'||event.error==='service-not-allowed'){
          status('마이크 권한을 허용해 주세요.');submitWhenStopped=false;
        }else if(event.error!=='no-speech'&&event.error!=='aborted'){
          status('음성 인식 오류가 발생했어요. 다시 시도하거나 텍스트로 입력해 주세요.');
        }
      };
      rec.onend=()=>{
        if(token!==recognitionToken)return;
        // Chrome may stop on silence despite continuous=true. Never auto-send.
        // If the user explicitly finished, send the accumulated transcript.
        if(!manualStop){
          recognition=null;listening=false;avatarState('idle');updateButton();
          if(finalized||interim){
            const input=$('talk-input');
            if(input)input.value=[input.value.trim(),finalized,interim].filter(Boolean).join(' ').trim();
            status('잠시 인식이 멈췄어요. 이어 말하려면 마이크를 다시 누르세요. 완료했다면 입력창의 보내기를 누르세요.');
          }else status('음성 인식이 종료됐어요. 마이크를 다시 눌러 주세요.');
          return;
        }
        completeSpeech();
      };
      rec.start();listening=true;avatarState('listening');
      status('듣고 있어요. 끝날 때 말하기 완료를 눌러 주세요.');
      updateTranscript();updateButton();
    }catch(e){recognition=null;listening=false;updateButton();status('마이크를 시작할 수 없어요. 권한을 확인해 주세요.');}
  }
  function offlineReply(text){
    const low=text.toLowerCase();
    if(low.includes('chicken')||low.includes('food'))return 'That sounds delicious! Do you like cooking at home?';
    if(low.includes('gym')||low.includes('exercise'))return 'That is great! How often do you exercise?';
    if(low.includes('work'))return 'I see! What do you like most about your job?';
    return 'Thank you for sharing! Can you tell me a little more?';
  }
  async function send(text){
    if(busy||!text.trim())return;
    busy=true;const requestSession=sessionId;avatarState('thinking');updateButton();bubble('user',text.trim());
    history.push({role:'user',content:text.trim().slice(0,700)});
    status('답변을 준비하고 있어요...');
    let reply;
    try{
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,history:history.slice(-12)})});
      if(!response.ok)throw new Error('API unavailable');
      const data=await response.json();if(!data.reply)throw new Error('Empty reply');
      reply=data.reply;status('AI 대화 중 · 마이크를 누르면 답할 수 있어요.');
      if($('talk-mode'))$('talk-mode').textContent='AI 대화 연결됨';
    }catch(e){
      reply=offlineReply(text);
      status('AI 연결이 없어 연습용 기본 응답으로 진행 중이에요.');
      if($('talk-mode'))$('talk-mode').textContent='기본 연습 모드 (AI 미연결)';
    }
    if(requestSession!==sessionId)return;
    history.push({role:'assistant',content:reply});
    bubble('assistant',reply);busy=false;updateButton();speak(reply);
  }
  window.talkStart=function(){
    window.speechSynthesis?.cancel();
    if(recognition){finishSpeech();return;}
    begin();
  };
  window.talkSendText=function(){
    const input=$('talk-input');if(!input)return;
    const value=input.value.trim();if(!value)return;
    input.value='';send(value);
  };
  window.talkReset=function(){
    sessionId++;
    recognitionToken++;if(recognition){recognition.abort();recognition=null;}
    finalized='';interim='';submitWhenStopped=false;manualStop=false;updateTranscript();
    if($('talk-input'))$('talk-input').value='';
    window.speechSynthesis?.cancel();avatarState('idle');listening=false;busy=false;history=[];
    topic=$('talk-topic')?.value||'daily life';
    if($('talk-log'))$('talk-log').textContent='';
    if($('talk-mode'))$('talk-mode').textContent='연결 상태 확인 중';
    const greeting=opening[topic]||opening['daily life'];
    bubble('assistant',greeting);history.push({role:'assistant',content:greeting});
    status('마이크를 눌러 영어로 답변해 보세요.');updateButton();speak(greeting);
  };
  window.talkStop=function(){
    const snapshot=history.map(m=>({...m}));sessionId++;
    if(recognition){recognition.abort();recognition=null;}
    window.speechSynthesis?.cancel();avatarState('idle');listening=false;updateButton();status('대화를 종료했어요.');
    if(typeof window.talkAnalyze==='function')window.talkAnalyze(snapshot,topic);
  };
  window.addEventListener('DOMContentLoaded',()=>{if($('talk-log')){talkReset();$('talk-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();talkSendText();}});}});
})();
