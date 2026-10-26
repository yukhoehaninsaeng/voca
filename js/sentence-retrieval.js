/* VocaMate Phase 1: independent sentence retrieval, graduated hints, local spaced review. */
(function(){
 'use strict';
 const KEY='vm-sentence-retrieval-v1';
 const $=id=>document.getElementById(id);
 const tasks=[
  {id:'usually-weekend',ko:'나는 주말에 보통 여자친구랑 시간을 보내.',en:'I usually spend time with my girlfriend on weekends.',pattern:'I usually ...',words:['spend time','girlfriend','weekends'],keywords:['usually','girlfriend'],alts:['I usually hang out with my girlfriend on weekends.']},
  {id:'cook-together',ko:'우리는 종종 같이 요리해.',en:'We often cook together.',pattern:'We often ...',words:['cook','together'],keywords:['cook','together'],alts:['We often make food together.']},
  {id:'monday-tired',ko:'오늘 피곤했어. 월요일이기 때문이야.',en:"I was tired today because it's Monday.",pattern:'I was ... because ...',words:['tired','Monday'],keywords:['tired','monday'],alts:["I'm tired today because it's Monday."]},
  {id:'weekend-over',ko:'주말이 끝나서 피곤한 것 같아.',en:"I guess I'm tired because the weekend is over.",pattern:'I guess ... because ...',words:['weekend','over'],keywords:['tired','weekend'],alts:["Maybe I'm tired because the weekend is over."]},
  {id:'after-work',ko:'퇴근하고 집에 갔어.',en:'I went home after work.',pattern:'I ... after ...',words:['went home','work'],keywords:['home','work'],alts:['After work, I went home.']},
  {id:'date-food',ko:'여자친구랑 데이트하고 맛있는 걸 먹었어.',en:'I went on a date with my girlfriend and we had some good food.',pattern:'I went ... and we ...',words:['date','girlfriend','food'],keywords:['girlfriend','food'],alts:['I went out with my girlfriend and we ate something delicious.']},
  {id:'work-late',ko:'어제 늦게까지 일해야 했어.',en:'I had to work late yesterday.',pattern:'I had to ...',words:['work late','yesterday'],keywords:['work','late'],alts:['Yesterday, I had to work late.']},
  {id:'weekend-movies',ko:'우리는 가끔 주말에 영화를 봐.',en:'Sometimes we watch movies on weekends.',pattern:'Sometimes we ...',words:['watch','movies','weekends'],keywords:['movies','weekends'],alts:['We sometimes watch movies on weekends.']},
  {id:'coffee-usually',ko:'나는 보통 아침에 커피를 마셔.',en:'I usually drink coffee in the morning.',pattern:'I usually ...',words:['drink coffee','morning'],keywords:['coffee','morning'],alts:['I usually have coffee in the morning.']},
  {id:'busy-meeting',ko:'오늘 회의가 있어서 바빴어.',en:'I was busy today because I had a meeting.',pattern:'I was ... because ...',words:['busy','meeting'],keywords:['busy','meeting'],alts:["I had a meeting today, so I was busy."]}
 ];
 const now=()=>Date.now(),day=86400000;
 const load=()=>{try{const v=JSON.parse(localStorage.getItem(KEY));return v&&typeof v==='object'&&Array.isArray(v.attempts)&&v.cards?v:{attempts:[],cards:{}};}catch(e){return {attempts:[],cards:{}};}};
 const save=d=>{try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){setStatus('저장 공간이 부족해 결과를 저장하지 못했어요.');}};
 let current=null,started=0,hint=0,checked=false,rec=null,spoken='',recognitionStarted=false,queue=[];
 const setStatus=t=>{if($('retrieval-status'))$('retrieval-status').textContent=t;};
 const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
 function choose(){
  while(queue.length){const id=queue.shift(),selected=tasks.find(t=>t.id===id);if(selected)return selected;}
  const data=load(),due=tasks.filter(t=>!data.cards[t.id]||data.cards[t.id].due<=now());
  const pool=due.length?due:tasks;
  const min=Math.min(...pool.map(t=>data.cards[t.id]?.attempts||0));
  const least=pool.filter(t=>(data.cards[t.id]?.attempts||0)===min);
  return least[Math.floor(Math.random()*least.length)];
 }
 function renderStats(){
  const data=load(),attempts=data.attempts,success=attempts.filter(a=>a.independent).length;
  if($('retrieval-stats'))$('retrieval-stats').textContent='총 '+attempts.length+'회 · 힌트 없이 성공 '+success+'회 · 복습 예정 '+tasks.filter(t=>data.cards[t.id]&&data.cards[t.id].due<=now()).length+'개';
 }
 function next(){
  if(rec){try{rec.abort();}catch(e){}rec=null;}
  current=choose();started=now();hint=0;checked=false;spoken='';
  $('retrieval-prompt').textContent=current.ko;
  $('retrieval-pattern').textContent=current.pattern;
  $('retrieval-hint').textContent='먼저 힌트 없이 소리 내어 말해 보세요.';
  $('retrieval-answer').hidden=true;
  $('retrieval-answer').textContent='';
  $('retrieval-input').value='';
  $('retrieval-grade').hidden=true;
  $('retrieval-check').disabled=false;
  $('retrieval-hint-button').disabled=false;
  setStatus('정답은 하나만 있는 게 아니에요. 같은 뜻이면 다른 표현도 괜찮아요.');
  renderStats();
 }
 function showHint(){
  if(!current||checked)return;
  hint=Math.min(hint+1,5);
  const hints=['','힌트: 평소 습관·이유 등 문장의 기능을 생각해 봐.','문장 뼈대: '+current.pattern,'사용할 단어: '+current.words.join(' / '),'문장 시작: '+current.en.split(' ').slice(0,Math.min(4,current.en.split(' ').length)).join(' ')+' ...','예시: '+current.en];
  $('retrieval-hint').textContent=hints[hint];
  if(hint===5)$('retrieval-answer').hidden=false,$('retrieval-answer').textContent=current.en;
 }
 function check(){
  if(!current||checked)return;
  const input=$('retrieval-input').value.trim()||spoken;
  if(!input){setStatus('먼저 문장을 말하거나 입력해 주세요. 어려우면 힌트를 눌러도 돼요.');return;}
  checked=true;const elapsed=now()-started;
  const n=normalize(input),candidates=[current.en,...current.alts].map(normalize);
  const matched=candidates.some(x=>x===n);
  const keywordCount=current.keywords.filter(x=>n.includes(normalize(x))).length;
  const advisory=matched?'예시 문장과 일치해요.':keywordCount===current.keywords.length?'핵심 표현이 들어 있어요. 의미·문법이 자연스러운지 예시와 비교해 보세요.':'표현이 달라도 괜찮아요. 의미가 통했는지 예시와 비교해 보세요.';
  $('retrieval-answer').hidden=false;
  $('retrieval-answer').textContent='내 답변: '+input+'\n추천 표현: '+current.en+'\n'+advisory;
  $('retrieval-grade').hidden=false;
  $('retrieval-check').disabled=true;$('retrieval-hint-button').disabled=true;
  setStatus('직접 비교한 뒤 아래에서 스스로 평가해 주세요. 자동 판정은 참고용입니다.');
  current._attempt={answer:input,elapsedMs:elapsed,hintLevel:hint,matched};
 }
 function grade(ok){
  if(!current||!checked||!current._attempt)return;
  const data=load(),prev=data.cards[current.id]||{level:0,attempts:0};
  const independent=ok&&current._attempt.hintLevel===0;
  const level=independent?Math.min(4,prev.level+1):Math.max(0,prev.level-1);
  const interval=independent?[1,3,7,14,30][level]:1;
  data.cards[current.id]={level,attempts:prev.attempts+1,due:now()+interval*day,last:now()};
  data.attempts.push({id:current.id,at:new Date().toISOString(),...current._attempt,selfRatedCorrect:ok,independent});
  data.attempts=data.attempts.slice(-500);
  save(data);window.dispatchEvent(new Event('voca-speaking-progress'));next();
 }
 function mic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){setStatus('이 브라우저에서는 음성 인식이 지원되지 않아요. 입력창으로 연습해 주세요.');return;}
  if(rec){rec.stop();return;}
  spoken='';const r=new SR();rec=r;r.lang='en-US';r.interimResults=true;r.continuous=true;recognitionStarted=true;
  const button=$('retrieval-mic');button.textContent='■ 말하기 완료';
  r.onresult=e=>{const text=Array.from(e.results).map(x=>x[0]?.transcript||'').join(' ').trim();spoken=text;$('retrieval-input').value=text;};
  r.onerror=e=>{if(e.error!=='no-speech')setStatus('마이크 오류: '+e.error);};
  r.onend=()=>{if(rec===r)rec=null;button.textContent='🎤 말하기';};
  try{r.start();setStatus('영어로 말해 보세요. 끝나면 말하기 완료를 누르세요.');}catch(e){rec=null;button.textContent='🎤 말하기';setStatus('마이크 시작에 실패했어요.');}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  if(!$('retrieval-prompt'))return;
  $('retrieval-next').addEventListener('click',next);
  $('retrieval-hint-button').addEventListener('click',showHint);
  $('retrieval-check').addEventListener('click',check);
  $('retrieval-mic').addEventListener('click',mic);
  $('retrieval-correct').addEventListener('click',()=>grade(true));
  $('retrieval-retry').addEventListener('click',()=>grade(false));
  $('retrieval-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();check();}});
  window.addEventListener('voca-retrieval-select',e=>{const ids=Array.isArray(e.detail?.ids)?e.detail.ids:[e.detail?.id];queue=ids.filter(id=>tasks.some(t=>t.id===id));if(queue.length)next();});
  next();
 });
})();
