/* Push-to-talk English conversation. Works without camera; AI needs /api/chat configured. */
(function(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recognition=null, busy=false, history=[],topic='daily life',listening=false;
  const $=id=>document.getElementById(id);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=message=>{if($('talk-status'))$('talk-status').textContent=message;};
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
    const utterance=new SpeechSynthesisUtterance(message);
    utterance.lang='en-US';utterance.rate=0.85;utterance.pitch=1;
    utterance.onerror=()=>status('음성 재생이 제한되었어요. 텍스트로 계속 연습할 수 있어요.');
    window.speechSynthesis.speak(utterance);
  }
  function begin(){
    if(recognition||busy)return;
    if(!SpeechRecognition){status('이 브라우저에서는 음성 인식을 지원하지 않아요. 아래 입력창을 사용해 주세요.');return;}
    try{
      window.speechSynthesis?.cancel();
      recognition=new SpeechRecognition();recognition.lang='en-US';recognition.interimResults=false;recognition.continuous=false;
      recognition.onresult=event=>{const text=event.results?.[0]?.[0]?.transcript?.trim();if(text)send(text);};
      recognition.onerror=event=>{status(event.error==='not-allowed'?'마이크 권한을 허용해 주세요.':'음성을 인식하지 못했어요. 다시 시도해 주세요.');};
      recognition.onend=()=>{recognition=null;listening=false;updateButton();};
      recognition.start();listening=true;status('듣고 있어요. 영어로 말해 보세요.');updateButton();
    }catch(e){recognition=null;listening=false;updateButton();status('마이크를 시작할 수 없어요. HTTPS 및 브라우저 권한을 확인해 주세요.');}
  }
  function updateButton(){const b=$('talk-mic');if(b){b.disabled=busy;b.textContent=listening?'■ 듣기 중지':'🎤 마이크로 말하기';b.setAttribute('aria-pressed',String(listening));}}
  function offlineReply(text){
    const low=text.toLowerCase();
    if(low.includes('chicken')||low.includes('food'))return 'That sounds delicious! Do you like cooking at home?';
    if(low.includes('gym')||low.includes('exercise'))return 'That is great! How often do you exercise?';
    if(low.includes('work'))return 'I see! What do you like most about your job?';
    return 'Thank you for sharing! Can you tell me a little more?';
  }
  async function send(text){
    if(busy||!text.trim())return;
    busy=true;updateButton();bubble('user',text.trim());
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
    history.push({role:'assistant',content:reply});
    bubble('assistant',reply);busy=false;updateButton();speak(reply);
  }
  window.talkStart=function(){
    window.speechSynthesis?.cancel();
    if(recognition){recognition.stop();return;}
    begin();
  };
  window.talkSendText=function(){
    const input=$('talk-input');if(!input)return;
    const value=input.value.trim();if(!value)return;
    input.value='';send(value);
  };
  window.talkReset=function(){
    if(recognition){recognition.abort();recognition=null;}
    window.speechSynthesis?.cancel();listening=false;busy=false;history=[];
    topic=$('talk-topic')?.value||'daily life';
    if($('talk-log'))$('talk-log').textContent='';
    if($('talk-mode'))$('talk-mode').textContent='연결 상태 확인 중';
    const greeting=opening[topic]||opening['daily life'];
    bubble('assistant',greeting);history.push({role:'assistant',content:greeting});
    status('마이크를 눌러 영어로 답변해 보세요.');updateButton();speak(greeting);
  };
  window.talkStop=function(){
    if(recognition){recognition.abort();recognition=null;}
    window.speechSynthesis?.cancel();listening=false;updateButton();status('대화를 종료했어요.');
  };
  window.addEventListener('DOMContentLoaded',()=>{if($('talk-log')){talkReset();$('talk-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();talkSendText();}});}});
})();
