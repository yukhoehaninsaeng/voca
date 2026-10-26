/* Push-to-talk English conversation. Works without camera; AI needs /api/chat configured. */
(function(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recognition=null, busy=false, history=[],topic='daily life',listening=false, sessionId=0;
  let finalized='',interim='',submitWhenStopped=false,manualStop=false,recognitionToken=0,callActive=false,captions=false,autoTurn=false,silenceTimer=null,heardSpeech=false,sttChunks=[],pendingReview=false,recognitionRestartTimer=null;
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
  const VOICE_KEY='vm-talk-voice-v1';
  let callStartedAt=0,callClock=null;
  const VOICE_MIGRATION='vm-talk-voice-default-v2';
  if(!localStorage.getItem(VOICE_MIGRATION)){localStorage.setItem(VOICE_KEY,'default');localStorage.setItem(VOICE_MIGRATION,'1');}
  function englishVoices(){
    if(!window.speechSynthesis)return [];
    return window.speechSynthesis.getVoices().filter(v=>/^en([_-]|$)/i.test(v.lang));
  }
  function preferredVoice(voices){
    const saved=localStorage.getItem(VOICE_KEY);
    if(saved&&saved!=='default'){const v=voices.find(x=>x.voiceURI===saved);if(v)return v;}
    return null; // Let the browser select its natural default English voice.
  }
  function refreshVoices(){
    const select=$('talk-voice');if(!select)return;
    const voices=englishVoices(),saved=localStorage.getItem(VOICE_KEY)||'default';
    select.replaceChildren();
    const option=document.createElement('option');option.value='default';option.textContent='기본 목소리 (추천)';select.append(option);
    voices.forEach(v=>{const o=document.createElement('option');o.value=v.voiceURI;o.textContent=v.name+' ('+v.lang+')';select.append(o);});
    select.value=voices.some(v=>v.voiceURI===saved)?saved:'default';
  }
  function callState(state,message){
    const card=$('talk-call-panel');if(card)card.dataset.callState=state;
    const label=$('talk-call-state');if(label)label.textContent=message||({idle:'통화 대기',speaking:'AI가 말하는 중',listening:'내 목소리를 듣는 중',thinking:'AI가 생각하는 중',error:'연결 확인 필요'}[state]||state);
  }
  function updateCallClock(){
    const node=$('talk-call-clock');if(!node)return;
    const elapsed=callStartedAt?Math.floor((Date.now()-callStartedAt)/1000):0;
    node.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  }
  function stopCallClock(){if(callClock){clearInterval(callClock);callClock=null;}callStartedAt=0;updateCallClock();}
  window.talkPreviewVoice=function(){speak('Hi! It is nice to meet you. How are you today?',false);};
  function speak(message,autoListen=true){
    if(!('speechSynthesis' in window)){status('음성 재생 미지원 · 텍스트를 확인해 주세요.');callState('error');return;}
    window.speechSynthesis.cancel();
    avatarState('speaking');
    const utterance=new SpeechSynthesisUtterance(message);
    // No synthetic mouth overlay: preserve the supplied character image.
    const voices=englishVoices();const voice=preferredVoice(voices);
    if(voice)utterance.voice=voice;
    utterance.lang=voice?.lang||'en-US';utterance.rate=1;utterance.pitch=1;
    callState('speaking');
    utterance.onend=()=>{callState('idle');avatarState('idle');const avatar=document.querySelector('.talk-avatar');if(avatar)avatar.dataset.mouth='closed';if(autoListen&&callActive&&!busy&&!listening)begin();};
    utterance.onerror=()=>{callState('error');avatarState('idle');status('음성 재생이 제한되었어요. 텍스트로 계속 연습할 수 있어요.');};
    window.speechSynthesis.speak(utterance);
  }
  const SILENCE_KEY='vm-talk-silence-seconds-v1';
  const clampSilence=value=>{const n=Number(value);return Number.isFinite(n)?Math.max(1.5,Math.min(7,Math.round(n*2)/2)):4;};
  let silenceSeconds=4;
  try{const stored=localStorage.getItem(SILENCE_KEY);if(stored!==null)silenceSeconds=clampSilence(stored);}catch(e){}
  function clearSilence(){if(silenceTimer){clearTimeout(silenceTimer);silenceTimer=null;}}
  function clearRestart(){if(recognitionRestartTimer){clearTimeout(recognitionRestartTimer);recognitionRestartTimer=null;}}
  const transcriptText=()=>[...sttChunks,finalized,interim].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  function showReview(text){
    const panel=$('talk-stt-review'),input=$('talk-stt-edit');if(!panel||!input)return false;
    input.value=text;panel.hidden=false;pendingReview=true;callState('idle','인식 결과 확인 중');
    status('음성인식 결과를 확인하고, 틀린 단어를 수정한 뒤 전송하세요.');return true;
  }
  function hideReview(){pendingReview=false;const panel=$('talk-stt-review');if(panel)panel.hidden=true;}
  window.talkConfirmTranscript=function(){const text=$('talk-stt-edit')?.value.trim()||'';if(!text){status('전송할 문장을 입력해 주세요.');return;}hideReview();send(text);};
  window.talkRetryTranscript=function(){hideReview();sttChunks=[];finalized='';interim='';heardSpeech=false;updateTranscript();begin();};
  function scheduleSilence(){clearSilence();if(!autoTurn||!callActive||!listening||!heardSpeech)return;silenceTimer=setTimeout(()=>{silenceTimer=null;if(autoTurn&&callActive&&listening&&(finalized||interim))finishSpeech();},silenceSeconds*1000);}
  window.talkSetSilence=function(value){
    silenceSeconds=clampSilence(value);
    const slider=$('talk-silence-seconds'),label=$('talk-silence-value');
    if(slider)slider.value=String(silenceSeconds);
    if(label)label.textContent=silenceSeconds.toFixed(1)+'초';
    try{localStorage.setItem(SILENCE_KEY,String(silenceSeconds));}catch(e){}
    if(autoTurn&&listening&&heardSpeech)scheduleSilence();
    status('자동 턴 전환 대기 시간: '+silenceSeconds.toFixed(1)+'초');
  };
  window.talkSetAutoTurn=function(checked){
    autoTurn=Boolean(checked);if(!autoTurn)clearSilence();else if(listening&&heardSpeech)scheduleSilence();
    status(autoTurn?'자동 턴 전환 켜짐 · 말한 뒤 약 '+silenceSeconds.toFixed(1)+'초 멈추면 답변을 보냅니다.':'수동 턴 전환 · 말하기 완료를 눌러 전송하세요.');
  };
  function updateTranscript(){
    const node=$('talk-live-transcript');
    if(node){node.textContent=transcriptText();node.hidden=!captions;}
  }
  function updateButton(){
    const b=$('talk-mic');if(!b)return;
    b.disabled=busy;
    b.textContent=listening?'✓ 말하기 완료':'🎤 마이크로 말하기';
    b.setAttribute('aria-pressed',String(listening));
  }
  function finishSpeech(){
    if(!recognition||!listening)return;
    clearSilence();manualStop=true;submitWhenStopped=true;
    status('말하기를 마무리하고 있어요...');
    try{recognition.stop();}catch(e){completeSpeech();}
  }
  function completeSpeech(){
    const draft=$('talk-input')?.value.trim()||'';
    const text=[draft,transcriptText()].filter(Boolean).join(' ').trim();
    if($('talk-input'))$('talk-input').value='';
    listening=false;recognition=null;avatarState('idle');updateButton();callState('thinking');
    if(submitWhenStopped&&text){if(!showReview(text))send(text);}
    else if(submitWhenStopped)status('인식된 문장이 없어요. 다시 말해 주세요.');
    else if(text)status('음성 인식이 멈췄어요. 마이크를 눌러 이어서 말하거나 텍스트로 입력하세요.');
    submitWhenStopped=false;manualStop=false;sttChunks=[];finalized='';interim='';
    updateTranscript();
  }
  function begin(resuming=false){
    if(recognition||busy||pendingReview)return;
    if(!SpeechRecognition){status('이 브라우저는 음성 인식을 지원하지 않아요. 텍스트 입력을 이용해 주세요.');return;}
    window.speechSynthesis?.cancel();
    clearSilence();clearRestart();if(!resuming)sttChunks=[];heardSpeech=Boolean(transcriptText());finalized='';interim='';submitWhenStopped=false;manualStop=false;
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
        finalized=finals.join(' ');interim=partials.join(' ');heardSpeech=Boolean(transcriptText());updateTranscript();scheduleSilence();
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
        clearSilence();
        if(!manualStop){
          // Browsers may end recognition on a brief pause. Preserve text and
          // restart without sending prematurely when auto-turn is enabled.
          if(finalized||interim)sttChunks.push([finalized,interim].filter(Boolean).join(' '));
          finalized='';interim='';recognition=null;listening=false;heardSpeech=Boolean(transcriptText());
          avatarState('idle');updateButton();updateTranscript();
          if(autoTurn&&callActive&&heardSpeech){
            status('잠시 인식이 끊겼어요. 앞 문장을 보존하고 다시 듣습니다.');
            recognitionRestartTimer=setTimeout(()=>{recognitionRestartTimer=null;if(callActive&&!busy&&!pendingReview)begin(true);},250);
          }else if(heardSpeech){
            showReview(transcriptText());sttChunks=[];updateTranscript();
          }else status('음성 인식이 종료됐어요. 마이크를 다시 눌러 주세요.');
          return;
        }
        completeSpeech();
      };
      rec.start();listening=true;avatarState('listening');callState('listening');
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
    busy=true;const requestSession=sessionId;avatarState('thinking');callState('thinking');updateButton();bubble('user',text.trim());
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
      if(requestSession!==sessionId)return;
      const hasKey=Boolean(window.VocaUser?.active?.().key);
      if(hasKey){
        status('AI 응답 실패 · 키, 모델, 사용 한도 또는 네트워크를 확인해 주세요. 자동으로 가짜 AI 답변을 생성하지 않습니다.');
        if($('talk-mode'))$('talk-mode').textContent='AI 연결 오류';
        busy=false;avatarState('idle');callState('error');updateButton();return;
      }
      reply=offlineReply(text);
      status('AI 키 미설정 · 기본 연습 응답입니다. 마이에서 키를 등록해 주세요.');
      if($('talk-mode'))$('talk-mode').textContent='기본 연습 모드 (AI 키 미설정)';
    }
    if(requestSession!==sessionId)return;
    history.push({role:'assistant',content:reply});
    bubble('assistant',reply);busy=false;updateButton();speak(reply);
  }
  window.talkBeginCall=function(){
    if(callActive)return;
    callActive=true;callStartedAt=Date.now();updateCallClock();if(callClock)clearInterval(callClock);callClock=setInterval(updateCallClock,1000);
    const log=$('talk-log');if(log)log.hidden=!captions;
    const greeting=opening[topic]||opening['daily life'];
    status('AI 친구가 먼저 말을 걸어요. 질문이 끝나면 마이크가 자동으로 켜집니다.');
    speak(greeting);
  };
  window.talkToggleTranscript=function(){
    captions=!captions;
    const log=$('talk-log');if(log)log.hidden=!captions;
    updateTranscript();
    status(captions?'자막이 표시돼요.':'자막을 숨겼어요. 목소리에 집중해 보세요.');
  };
  window.talkStart=function(){
    window.speechSynthesis?.cancel();
    if(recognition){finishSpeech();return;}
    if(pendingReview){status('먼저 인식된 문장을 확인하거나 다시 말하기를 선택해 주세요.');return;}
    if(!callActive){callActive=true;callStartedAt=Date.now();updateCallClock();callClock=setInterval(updateCallClock,1000);}
    begin();
  };
  window.talkSendText=function(){
    const input=$('talk-input');if(!input)return;
    const value=input.value.trim();if(!value)return;
    input.value='';hideReview();send(value);
  };
  window.talkReset=function(){
    clearSilence();clearRestart();hideReview();sttChunks=[];sessionId++;callActive=false;stopCallClock();callState('idle');
    recognitionToken++;if(recognition){recognition.abort();recognition=null;}
    finalized='';interim='';submitWhenStopped=false;manualStop=false;updateTranscript();
    if($('talk-input'))$('talk-input').value='';
    window.speechSynthesis?.cancel();avatarState('idle');listening=false;busy=false;history=[];
    topic=$('talk-topic')?.value||'daily life';
    if($('talk-log'))$('talk-log').textContent='';
    if($('talk-mode'))$('talk-mode').textContent='연결 상태 확인 중';
    const greeting=opening[topic]||opening['daily life'];
    bubble('assistant',greeting);history.push({role:'assistant',content:greeting});
    if($('talk-log'))$('talk-log').hidden=!captions;
    callState('idle');status('음성 대화 시작을 눌러 AI 친구의 첫 질문을 들어 보세요.');updateButton();
  };
  window.talkStop=function(){
    const snapshot=history.map(m=>({...m}));clearSilence();clearRestart();hideReview();sttChunks=[];sessionId++;callActive=false;stopCallClock();callState('idle');
    window.dispatchEvent(new CustomEvent('voca-conversation-finished',{detail:{topic,history:snapshot}}));
    recognitionToken++;if(recognition){recognition.abort();recognition=null;}
    window.speechSynthesis?.cancel();avatarState('idle');listening=false;busy=false;updateButton();status('대화를 종료했어요.');
    if($('talk-log'))$('talk-log').hidden=false;
    if(typeof window.talkAnalyze==='function')window.talkAnalyze(snapshot,topic);
  };
  window.addEventListener('DOMContentLoaded',()=>{const slider=$('talk-silence-seconds'),label=$('talk-silence-value');if(slider)slider.value=String(silenceSeconds);if(label)label.textContent=silenceSeconds.toFixed(1)+'초';refreshVoices();if(window.speechSynthesis){window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);}const select=$('talk-voice');select?.addEventListener('change',()=>{localStorage.setItem(VOICE_KEY,select.value);});if($('talk-log')){talkReset();$('talk-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();talkSendText();}});}});
})();
