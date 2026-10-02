/* ─── PERSIST (localStorage) ────────────────────────── */
const LS={
  save(){
    try{
      localStorage.setItem('vm-words',JSON.stringify(typeof ownedWords!=='undefined'?ownedWords:words));
      localStorage.setItem('vm-sents',JSON.stringify(typeof ownedSents!=='undefined'?ownedSents:sents));
    }catch(e){}
  },
  load(){
    try{
      const w=localStorage.getItem('vm-words');
      if(w)words=JSON.parse(w);
      const s=localStorage.getItem('vm-sents');
      if(s)sents=JSON.parse(s);
      const ec=localStorage.getItem('vm-errCount');
      if(ec)errCount=JSON.parse(ec);
      const sec=localStorage.getItem('vm-sErrCount');
      if(sec)sErrCount=JSON.parse(sec);
      const sp=localStorage.getItem('vm-selectedPart');
      if(sp)selectedPart=sp;
      const sc=localStorage.getItem('vm-selectedCustom');
      if(sc)selectedCustom=sc||null;
    }catch(e){}
  },
};

/* ─── STATE ─────────────────────────────────────────── */
let aiCache={};
let words=[{word:'apple',meaning:'사과'},{word:'beautiful',meaning:'아름다운'},{word:'challenge',meaning:'도전'},{word:'diligent',meaning:'부지런한'},{word:'encourage',meaning:'격려하다'}];
let errCount={};
let sents=[{en:'It relieves my stress.',ko:'이것은 나의 스트레스를 풀어준다.'},{en:"It's cheaper, so I can save money.",ko:'이것은 더 싸서 돈을 절약할 수 있다.'},{en:'The price is reasonable.',ko:'가격이 저렴하다.'}];
let sErrCount={};
let selectedPart='all';
let selectedCustom=null;
let toeicErrCount={};

// session stats
let fKnow=0,fDunno=0,fFlipped=false,fQueue=[],fIdx=0;
let qOk=0,qNg=0,qAnswered=false,qQueue=[],qIdx=0;
let tOk=0,tNg=0,tQueue=[],tIdx=0;
let sOk=0,sNg=0,sAnswered=false,sQueue=[],sIdx=0,sentMode='blank';
let tsOk=0,tsNg=0,tsAnswered=false,tsQueue=[],tsIdx=0,toeicSentMode='blank';

// 앱 시작 시 저장된 데이터 복원
LS.load();
let ownedWords=words,ownedSents=sents,selectedStudyItems=null;
let catalog=VocabCore.buildCatalog({words:ownedWords,sents:ownedSents,toeicParts:TOEIC_PARTS,customCards:CUSTOM_CARDS});
let progressById={},studyEvents=[],selection={sourceIds:['mine_words'],mode:'flash',updatedAt:Date.now()},userProfile=null,dailyPlan=null,dailySession=null;
const repository=new VocabCore.LocalStorageRepository(localStorage);
try {
  VocabCore.migrationReport(localStorage,catalog,{words:ownedWords,sents:ownedSents,errCount,sErrCount});
  const snapshot=repository.loadSnapshot();
  progressById={...catalog.seedProgress,...snapshot.progress};
  studyEvents=Array.isArray(snapshot.events)?snapshot.events:[];
  if(snapshot.selection&&Array.isArray(snapshot.selection.sourceIds))selection={...selection,...snapshot.selection};
  userProfile=snapshot.profile;
  dailyPlan=snapshot.plan;
  dailySession=snapshot.session;
} catch(e) { setTimeout(()=>alert('데이터 마이그레이션을 완료하지 못했습니다. 기존 백업은 보존되었습니다: '+e.message),0); }
function rebuildCatalog(){catalog=VocabCore.buildCatalog({words:ownedWords,sents:ownedSents,toeicParts:TOEIC_PARTS,customCards:CUSTOM_CARDS});}
function persistV2(){try{repository.saveSnapshot({progress:progressById,events:studyEvents,selection,profile:userProfile,plan:dailyPlan,session:dailySession});return true;}catch(error){console.error('학습 상태 저장 실패',error);return false;}}
function currentItem(type,en,ko){return catalog.items.find(i=>i.type===type&&i.normalizedEn===VocabCore.normalize(en)&&i.normalizedKo===VocabCore.normalize(ko));}
function recordResult(type,en,ko,mode,correct,sourceIds=selection.sourceIds,itemId=null){const item=itemId?catalog.items.find(candidate=>candidate.id===itemId):currentItem(type,en,ko);if(!item)return;const task=dailySession?.steps?.find(step=>step.itemId===item.id&&!dailySession.results[`${dailySession.sessionId}:${step.taskId}`]),attemptId=task?`${dailySession.sessionId}:${task.taskId}`:null,event=VocabCore.recordStudyEvent({progress:progressById,events:studyEvents},{itemId:item.id,sourceIds,mode,correct,attemptId,taskType:task?.taskType,skill:task?.skill,sessionId:dailySession?.sessionId||'web'});if(task)VocabCore.submitSessionAttempt(dailySession,{taskId:task.taskId,attemptId,eventId:event.id});persistV2();}


/* ─── THEME ─────────────────────────────────────────── */
function toggleTheme(){document.body.classList.toggle('light');const l=document.body.classList.contains('light');localStorage.setItem('vm-theme',l?'light':'dark');document.querySelector('meta[name="theme-color"]').setAttribute('content',l?'#f5f5f8':'#0f0f13');}
(function(){const s=localStorage.getItem('vm-theme');if(s==='light'){document.body.classList.add('light');document.querySelector('meta[name="theme-color"]').setAttribute('content','#f5f5f8');}})();

/* ─── AI SERVER STATUS ───────────────────────────────── */
function showApiModal(){alert('AI 기능은 안전한 서버 연결이 설정된 배포에서만 사용할 수 있습니다. 로컬 학습은 AI 없이 계속됩니다.');}
function clearApiKey(){localStorage.removeItem('vm-apikey');}
localStorage.removeItem('vm-apikey');
document.getElementById('apiModal').style.display='none';

/* ─── CANVAS ─────────────────────────────────────────── */
const PAL=[['#1a2a4a','#0d1f3c','#5b9df9'],['#0d2e22','#0a2019','#1eca8b'],['#2e1f0a','#231600','#f5a623'],['#2a0d22','#1f0a18','#e86daa'],['#1a0d3a','#130929','#9b7cf8'],['#0d2a1a','#091f12','#4ec98a']];
function palette(i){return PAL[i%PAL.length];}
function drawScene(canvas,word,meaning,pal){const ctx=canvas.getContext('2d');const W=canvas.width=canvas.offsetWidth||340;const H=canvas.height=canvas.offsetHeight||120;ctx.clearRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,pal[0]);g.addColorStop(1,pal[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);const seed=word.charCodeAt(0)*31+word.length;for(let i=0;i<7;i++){const x=((seed*(i+1)*137)%W);const y=((seed*(i+2)*79)%H);const r=20+((seed*(i+3)*53)%45);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=pal[2]+(i%2===0?'20':'10');ctx.fill();}ctx.font=`900 ${Math.min(W,H)*.55}px Nunito,sans-serif`;ctx.fillStyle=pal[2]+'18';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(word[0].toUpperCase(),W*.8,H*.5);}

/* ─── AI ─────────────────────────────────────────────── */
async function getAI(){return{scene:'',memory:'',sentence:''};}

const escapeHtml=VocabCore.escapeHtml;
function renderAiText(container,sections){container.replaceChildren();sections.filter(section=>section.text).forEach(section=>{const wrap=document.createElement('div'),label=document.createElement('div'),text=document.createElement('div');wrap.className='ai-section';label.className=`ai-label ${section.className||''}`;label.textContent=section.label;text.className='ai-text';text.textContent=section.text;wrap.append(label,text);container.append(wrap);});}

/* ─── WORD LIST ──────────────────────────────────────── */
function addWord(){const wi=document.getElementById('wi'),mi=document.getElementById('mi');const w=wi.value.trim(),m=mi.value.trim();if(!w||!m)return;ownedWords.push({word:w,meaning:m});words=ownedWords;wi.value='';mi.value='';rebuildCatalog();renderWordList();wi.focus();LS.save();}
function delWord(i){ownedWords.splice(i,1);words=ownedWords;delete errCount[i];rebuildCatalog();renderWordList();LS.save();persistV2();}
document.getElementById('mi').addEventListener('keydown',e=>{if(e.key==='Enter')addWord();});
document.getElementById('wi').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('mi').focus();});

/* ─── SENT LIST ──────────────────────────────────────── */
function addSent(){const ei=document.getElementById('si-en'),ki=document.getElementById('si-ko');const e=ei.value.trim(),k=ki.value.trim();if(!e||!k)return;ownedSents.push({en:e,ko:k});sents=ownedSents;ei.value='';ki.value='';rebuildCatalog();renderSentList();ei.focus();LS.save();}
function delSent(i){ownedSents.splice(i,1);sents=ownedSents;delete sErrCount[i];rebuildCatalog();renderSentList();LS.save();persistV2();}
document.getElementById('si-ko').addEventListener('keydown',e=>{if(e.key==='Enter')addSent();});

/* ─── CUSTOM CARD HELPERS ────────────────────────────── */
/* 커스텀 카드 전체 합산 — sent/word/mistake 모두 문장으로 변환 */
function getAllCustomSents(){
  const result=[];
  CUSTOM_CARDS.forEach(cc=>{
    if(cc.type==='sent')cc.sents.forEach(s=>result.push(s));
    else if(cc.type==='word')cc.words.forEach(w=>result.push({en:w.word,ko:w.meaning}));
    else if(cc.type==='mistake')cc.items.forEach(it=>result.push({en:it.correct,ko:`✗ ${it.wrong} → ✓ ${it.correct} (${it.note})`}));
  });
  return result;
}

function getToeicSents(){
  if(selectedCustom==='custom_all') return getAllCustomSents();
  if(selectedCustom){
    const cc=CUSTOM_CARDS.find(c=>c.id===selectedCustom);
    if(!cc)return[];
    if(cc.type==='sent')return cc.sents;
    if(cc.type==='word')return cc.words.map(w=>({en:w.word,ko:w.meaning}));
    if(cc.type==='mistake')return cc.items.map(it=>({en:it.correct,ko:`✗ ${it.wrong} → ✓ ${it.correct} (${it.note})`}));
    return[];
  }
  if(selectedPart==='all')return[...TOEIC_PARTS.p2,...TOEIC_PARTS.p3,...TOEIC_PARTS.p4,...TOEIC_PARTS.p5];
  return TOEIC_PARTS[selectedPart]||[];
}

function renderCustomCards(){
  const scroll=document.getElementById('custom-cards-scroll');
  if(!scroll) return;
  const totalCnt=getAllCustomSents().length;
  const isAllActive=selectedCustom==='custom_all';

  // 전체 학습 카드 (맨 앞)
  const allCard=`<div class="custom-card${isAllActive?' active-custom':''}"
    style="width:160px;background:${isAllActive?'var(--purple-bg)':'linear-gradient(135deg,rgba(155,124,248,.1),rgba(91,157,249,.08))'};border-color:${isAllActive?'var(--purple)':'rgba(155,124,248,.35)'};"
    onclick="selectCustom('custom_all')">
    <div class="cc-emoji">🗂️</div>
    <div class="cc-title" style="color:var(--purple)">커스텀 전체 학습</div>
    <div class="cc-sub">모든 카드 단어·문장 통합</div>
    <div class="cc-cnt" style="color:var(--purple);font-weight:900">${totalCnt}개 전체</div>
  </div>`;

  const cards=CUSTOM_CARDS.map(cc=>{
    const isActive=selectedCustom===cc.id;
    const isMistake=cc.type==='mistake';
    const cnt=cc.type==='sent'?cc.sents?.length:cc.type==='word'?cc.words?.length:cc.items?.length;
    return`<div class="${isMistake?'mistake-card':'custom-card'}${isActive?' active-custom':''}" onclick="selectCustom('${cc.id}')">
      ${!isMistake?`<span class="priority-badge ${cc.pClass}">${cc.priority}</span>`:''}
      <div class="cc-emoji">${cc.emoji}</div>
      <div class="cc-title">${cc.title}</div>
      <div class="cc-sub">${cc.sub}</div>
      <div class="cc-cnt" style="color:${isMistake?'var(--red)':'var(--text3)'}">${cnt}개</div>
    </div>`;
  }).join('');

  scroll.innerHTML=allCard+cards;
}

function selectCustom(id){
  if(selectedCustom===id){selectedCustom=null;}
  else{selectedCustom=id;selectedPart=null;}
  renderCustomCards();renderPartGrid();renderToeicPreview();
}

function renderPartGrid(){
  const grid=document.getElementById('part-grid');
  if(!grid) return;
  const parts=['all','p2','p3','p4','p5'];
  grid.innerHTML=parts.map(p=>{
    const info=PART_INFO[p];
    const cnt=p==='all'?Object.values(TOEIC_PARTS).reduce((a,v)=>a+v.length,0):TOEIC_PARTS[p]?.length||0;
    const isAll=p==='all';
    const isActive=!selectedCustom&&selectedPart===p;
    return`<div class="part-card${isAll?' part-all':''}${isActive?' active-part':''}" onclick="selectPart('${p}')">
      <div class="part-num">${info.label}</div>
      <div class="part-label">${info.sub}</div>
      <div class="part-cnt">${cnt}문장</div>
    </div>`;
  }).join('');
  renderToeicPreview();
}

function selectPart(p){selectedPart=p;selectedCustom=null;renderCustomCards();renderPartGrid();}

function renderToeicPreview(){
  const sents=getToeicSents().slice(0,4);
  const preview=document.getElementById('toeic-preview');
  if(!preview) return;
  if(!sents.length){preview.innerHTML='<div class="empty-msg" style="padding:1rem">위에서 파트 또는 카드를 선택하세요</div>';return;}
  preview.innerHTML=sents.map((s,i)=>`<div class="toeic-sent-item"><span class="tsi-num">${i+1}</span><div class="tsi-texts"><div class="tsi-en">${s.en}</div><div class="tsi-ko">${s.ko}</div></div></div>`).join('')
    +(getToeicSents().length>4?`<div style="text-align:center;font-size:.72rem;color:var(--text3);padding:.5rem;font-weight:700">... 외 ${getToeicSents().length-4}개</div>`:'');
}

/* ─── INPUT MODE SWITCH ──────────────────────────────── */
let inputMode='word';
function switchInputMode(m){
  inputMode=m;
  ['word','sent','toeic'].forEach(t=>{
    const btn=document.getElementById('sw-'+t);
    const sec=document.getElementById(t+'-input-section');
    if(btn) btn.classList.toggle('active',t===m);
    if(sec) sec.style.display=t===m?'block':'none';
  });
  if(m==='toeic'){renderCustomCards();renderPartGrid();}
}

/* ─── NAV ────────────────────────────────────────────── */
function go(tab){
  if(tab==='input'||tab==='learn'){words=ownedWords;sents=ownedSents;selectedStudyItems=null;}
  document.querySelectorAll('.bnav-btn').forEach((b,i)=>b.classList.toggle('active',['learn','input'][i]===tab));
  document.querySelectorAll('.tnav-btn').forEach((b,i)=>b.classList.toggle('active',['input','learn'][i]===tab));
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  const target=document.getElementById('s-'+tab);if(!target)return;
  target.classList.add('on');
  if(typeof window.scrollTo==='function')window.scrollTo({top:0,behavior:'smooth'});
  // 현재 탭 저장
  try{localStorage.setItem('vm-tab',tab);}catch(e){}
  if(tab==='learn')renderLearnScreen();
  if(tab==='flash')initFlash();
  if(tab==='quiz')initQuiz();
  if(tab==='type')initType();
  if(tab==='sent')initSent();
  if(tab==='toeic')initToeic();
  if(tab==='voice')initVoice();
}

/* ─── DASHBOARD ──────────────────────────────────────── */
function repeatCount(){return Object.entries(errCount).filter(([key,value])=>!key.startsWith('__w__')&&value>0).length;}

/* 틀린 단어 2회 이상 → 커스텀카드 매번틀린단어에 자동 등록 */
function trackWrongWord(word,meaning){
  // v2에서는 recordStudyEvent()의 Progress.lapses가 mistakes 가상 Source를 계산한다.
  return Boolean(word||meaning);
}

function renderLearnScreen(){
  renderTodayPlan();
  const wc=words.length,sc=sents.length,tc=getToeicSents().length;
  const rc=repeatCount(),src=Object.values(sErrCount).filter(v=>v>0).length,trc=Object.values(toeicErrCount).filter(v=>v>0).length;
  const totalRepeat=rc+src+trc;
  const sOkT=fKnow+qOk+tOk+sOk+tsOk,sNgT=fDunno+qNg+tNg+sNg+tsNg,sTotal=sOkT+sNgT;
  const acc=sTotal>0?Math.round((sOkT/sTotal)*100):0;
  const h=new Date().getHours();
  const greet=h<12?'좋은 아침이에요! ☀️':h<18?'열심히 공부 중! 💪':h<22?'저녁 학습 시작! 🌙':'야심한 밤 공부 🌟';
  document.getElementById('dash-greeting').textContent=greet;
  document.getElementById('dash-sub').textContent=sTotal>0?`오늘 ${sTotal}문제 · 정확도 ${acc}%`:`단어 ${wc}개 · 문장 ${sc}개 · 토익 ${tc}문장`;
  const circ=163.4;
  document.getElementById('dash-ring-circle').style.strokeDashoffset=circ-(acc/100)*circ;
  document.getElementById('dash-ring-circle').style.stroke=acc>=80?'var(--green)':acc>=50?'var(--amber)':'var(--accent)';
  document.getElementById('dash-ring-pct').textContent=acc+'%';
  document.getElementById('ds-total').textContent=sTotal||wc+sc+tc;
  document.getElementById('ds-correct').textContent=sOkT;
  document.getElementById('ds-review').textContent=totalRepeat;
  const al=document.getElementById('dash-review-alert');
  if(totalRepeat>0){al.style.display='flex';al.innerHTML=`<div class="dash-review-alert"><span class="dra-icon">⚠️</span><span class="dra-text">복습이 필요한 항목이 <strong>${totalRepeat}개</strong> 있어요!</span><span class="dra-cnt">${totalRepeat}</span></div>`;}else{al.style.display='none';}

  /* ── 입력 모드에 따라 관련 섹션만 표시 ── */
  const show=(id,v)=>{const el=document.getElementById(id);if(el)el.style.display=v?'block':'none';};
  if(inputMode==='word'){
    show('learn-word-section',true);show('learn-sent-section',false);
    show('learn-toeic-section',false);show('learn-voice-section',false);
  }else if(inputMode==='sent'){
    show('learn-word-section',false);show('learn-sent-section',true);
    show('learn-toeic-section',false);show('learn-voice-section',true);
  }else if(inputMode==='toeic'){
    show('learn-word-section',false);show('learn-sent-section',false);
    show('learn-toeic-section',true);show('learn-voice-section',true);
  }else{
    ['learn-word-section','learn-sent-section','learn-toeic-section','learn-voice-section'].forEach(id=>show(id,true));
  }

  const nw=wc===0,fw=wc<2;
  ['mc-flash','mc-type'].forEach(id=>document.getElementById(id)?.classList.toggle('disabled',nw));
  document.getElementById('mc-quiz')?.classList.toggle('disabled',fw);
  const wb=rc>0?`<span class="mc-repeat-badge">🔁${rc}</span>`:'';
  document.getElementById('mc-flash-cnt').innerHTML=nw?'단어 추가 필요':`${wc}개 ${wb}`;
  document.getElementById('mc-quiz-cnt').innerHTML=fw?'2개 이상 필요':`${wc}개 ${wb}`;
  document.getElementById('mc-type-cnt').innerHTML=nw?'단어 추가 필요':`${wc}개 ${wb}`;
  const ns=sc===0;
  ['mc-blank','mc-full'].forEach(id=>document.getElementById(id)?.classList.toggle('disabled',ns));
  const sb=src>0?`<span class="mc-repeat-badge">🔁${src}</span>`:'';
  document.getElementById('mc-blank-cnt').innerHTML=ns?'문장 추가 필요':`${sc}개 ${sb}`;
  document.getElementById('mc-full-cnt').innerHTML=ns?'문장 추가 필요':`${sc}개 ${sb}`;
  const nt=tc===0;
  ['mc-toeic-blank','mc-toeic-full'].forEach(id=>document.getElementById(id)?.classList.toggle('disabled',nt));
  const tb=trc>0?`<span class="mc-repeat-badge">🔁${trc}</span>`:'';
  const partLabel=selectedPart==='all'?'전체':PART_INFO[selectedPart]?.label;
  document.getElementById('mc-toeic-blank-cnt').innerHTML=nt?'파트 선택 필요':`${partLabel} ${tc}문장 ${tb}`;
  document.getElementById('mc-toeic-full-cnt').innerHTML=nt?'파트 선택 필요':`${partLabel} ${tc}문장 ${tb}`;
  document.getElementById('mc-toeic-voice-cnt').innerHTML=`토익 ${tc} + 내 문장 ${sents.length}개`;
  const voiceEl=document.getElementById('mc-voice-cnt');
  if(voiceEl)voiceEl.innerHTML=`토익 ${tc}문장 + 내 문장 ${sc}개`;
  renderSelection();
}

/* ─── QUEUES ─────────────────────────────────────────── */
function buildQueue(base,ec){const q=[...base];base.forEach(i=>{const e=ec[i]||0;for(let r=0;r<Math.min(e,3);r++)q.push(i);});for(let i=q.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[q[i],q[j]]=[q[j],q[i]];}return q;}
function repeatBanner(cid,sid,ec){const rc=Object.values(ec).filter(v=>v>0).length;const numEl=document.getElementById(sid);if(numEl) numEl.textContent=rc;const el=document.getElementById(cid);if(el){if(rc>0)el.innerHTML=`<div class="rq-banner"><span class="rq-icon">🔁</span><span class="rq-text">틀린 단어 <strong>${rc}개</strong>가 반복 출제돼요</span><span class="rq-cnt">${rc}</span></div>`;else el.innerHTML='';}}

/* ─── FLASH ──────────────────────────────────────────── */
function initFlash(){if(!words.length){document.getElementById('flash-body').innerHTML='<div class="empty-msg" style="padding:3rem">단어를 먼저 입력해주세요</div>';return;}fQueue=buildQueue([...Array(words.length).keys()],errCount);fIdx=0;fKnow=0;fDunno=0;repeatBanner('f-rq-banner','f-repeat',errCount);updateFStats();showFlash();}
function updateFStats(){document.getElementById('f-know').textContent=fKnow;document.getElementById('f-dunno').textContent=fDunno;}
function showFlash(){
  if(fIdx>=fQueue.length){
    const pct=Math.round((fKnow/(fKnow+fDunno||1))*100);
    const wrongIdxs=Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length);
    document.getElementById('flash-body').innerHTML=`<div class="complete-box">
      <span class="complete-emoji">${pct>=80?'🏆':pct>=50?'👍':'💪'}</span>
      <div class="complete-title">플래시카드 완료!</div>
      <div class="complete-sub">알아요 ${fKnow}개 · 모르겠어요 ${fDunno}개</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" onclick="initFlash()">다시 학습</button>
        ${wrongIdxs.length?`<button class="btn" style="border-color:var(--red);color:var(--red)" onclick="reviewFlash()">🔁 복습하기 (${wrongIdxs.length}개)</button>`:''}
      </div>
    </div>`;
    return;
  }
  const wi=fQueue[fIdx],w=words[wi],pal=palette(wi),isR=(errCount[wi]||0)>0;fFlipped=false;
  document.getElementById('flash-body').innerHTML=`<div class="mem-card" id="fcard" onclick="flipFlash(${wi})"><div class="mem-scene"><canvas id="fcanvas"></canvas></div><div class="mem-body">${isR?'<div class="ai-label repeat-lbl" style="margin-bottom:.5rem">🔁 복습 중</div>':''}<div class="mem-word" id="fword" style="filter:blur(6px)">${escapeHtml(w.word)}</div><div class="mem-meaning">${escapeHtml(w.meaning)}</div><div class="mem-reveal" id="freveal"><div id="fai-content"><div class="ai-loading">AI 연상법 생성 중</div></div></div><div class="tap-hint" id="ftap">탭하여 단어 확인 👆</div></div></div><div class="fc-btns"><button class="fc-btn dunno" onclick="markFlash(${wi},false)">😅 모르겠어요</button><button class="fc-btn know" onclick="markFlash(${wi},true)">✅ 알아요!</button></div><div class="ctr-line">${fIdx+1} / ${fQueue.length}</div>`;
  setTimeout(()=>{const c=document.getElementById('fcanvas');if(c)drawScene(c,w.word,w.meaning,pal);},50);getAI(w.word,w.meaning);
}
function reviewFlash(){
  const wrongIdxs=Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length);
  if(!wrongIdxs.length)return;
  fQueue=wrongIdxs.sort(()=>Math.random()-.5);fIdx=0;fKnow=0;fDunno=0;
  repeatBanner('f-rq-banner','f-repeat',errCount);updateFStats();showFlash();
}
async function flipFlash(wi){if(fFlipped)return;fFlipped=true;const w=words[wi];document.getElementById('fword').style.filter='none';document.getElementById('freveal').classList.add('on');document.getElementById('ftap').style.display='none';const ai=await getAI(w.word,w.meaning);const el=document.getElementById('fai-content');if(!el)return;const sentence=(ai.sentence||'').split('|').map(value=>value.trim()).filter(Boolean).join(' / ');renderAiText(el,[{label:'🖼 이미지 연상',className:'mem-lbl',text:ai.scene},{label:'💡 기억법',className:'mem-lbl2',text:ai.memory},{label:'📖 예문',className:'ex-lbl',text:sentence}]);if(!el.childElementCount)el.textContent='API 키를 설정하면 AI 연상법이 표시돼요';}
function markFlash(wi,know){const studied=words[wi];recordResult(studied._itemType||'word',studied.word,studied.meaning,'flash',know,selection.sourceIds,studied._itemId);if(know){fKnow++;if(errCount[wi]>0)errCount[wi]=Math.max(0,errCount[wi]-1);}else{fDunno++;errCount[wi]=(errCount[wi]||0)+1;}fIdx++;const fc=document.getElementById('fcard');if(fc){fc.classList.add('pop');setTimeout(()=>fc.classList.remove('pop'),250);}updateFStats();repeatBanner('f-rq-banner','f-repeat',errCount);renderWordList();LS.save();showFlash();}

/* ─── QUIZ ───────────────────────────────────────────── */
function initQuiz(){if(words.length<2){document.getElementById('quiz-body').innerHTML='<div class="empty-msg" style="padding:3rem">퀴즈는 단어 2개 이상 필요해요</div>';return;}qQueue=buildQueue([...Array(words.length).keys()],errCount);qIdx=0;qOk=0;qNg=0;qAnswered=false;repeatBanner('q-rq-banner','q-repeat',errCount);updateQStats();showQuiz();}
function updateQStats(){document.getElementById('q-ok').textContent=qOk;document.getElementById('q-ng').textContent=qNg;}
let _qEnterBound=false;
function _qEnterHandler(e){
  if(e.key!=='Enter')return;
  const next=document.getElementById('qnext');
  if(next&&next.style.display!=='none'){nextQuiz();}
}
function showQuiz(){
  if(_qEnterBound){document.removeEventListener('keydown',_qEnterHandler);_qEnterBound=false;}
  if(qIdx>=qQueue.length){
    const pct=Math.round((qOk/(qOk+qNg||1))*100);
    const wrongIdxs=[...new Set(Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length))];
    document.getElementById('quiz-body').innerHTML=`<div class="complete-box">
      <span class="complete-emoji">${pct>=80?'🏆':pct>=50?'👍':'💪'}</span>
      <div class="complete-title">퀴즈 완료! ${pct}점</div>
      <div class="complete-sub">정답 ${qOk} · 오답 ${qNg}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" onclick="initQuiz()">다시 풀기</button>
        ${wrongIdxs.length?`<button class="btn" style="border-color:var(--red);color:var(--red)" onclick="reviewQuiz()">🔁 복습하기 (${wrongIdxs.length}개)</button>`:''}
      </div>
    </div>`;
    return;
  }
  const wi=qQueue[qIdx],correct=words[wi],isR=(errCount[wi]||0)>0;
  const others=words.filter((_,i)=>i!==wi).sort(()=>Math.random()-.5).slice(0,3);
  const opts=[...others,correct].sort(()=>Math.random()-.5);qAnswered=false;
  document.getElementById('quiz-body').innerHTML=`<div class="qword-card">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="qword">${escapeHtml(correct.word)}</div><div class="qsub">알맞은 뜻을 고르세요</div></div><div class="qopts" id="qopts"></div><div class="feedback-box" id="qfb"></div><button class="btn btn-wide" id="qnext" style="display:none;margin-top:.25rem" onclick="nextQuiz()">다음 문제 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
  const optionHost=document.getElementById('qopts');opts.forEach(option=>{const button=document.createElement('button');button.className='qopt';button.dataset.meaning=option.meaning;button.textContent=option.meaning;button.addEventListener('click',()=>answerQuiz(button,option.meaning,correct.meaning,wi));optionHost.append(button);});
}
function reviewQuiz(){
  const wrongIdxs=[...new Set(Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length))];
  if(!wrongIdxs.length)return;
  qQueue=wrongIdxs.sort(()=>Math.random()-.5);qIdx=0;qOk=0;qNg=0;qAnswered=false;
  repeatBanner('q-rq-banner','q-repeat',errCount);updateQStats();showQuiz();
}
async function answerQuiz(btn,chosen,correct,wi){
  if(qAnswered)return;qAnswered=true;
  document.querySelectorAll('.qopt').forEach(b=>{b.disabled=true;if(b.dataset.meaning===correct)b.classList.add('correct');});
  const ok=chosen===correct;recordResult('word',words[wi].word,words[wi].meaning,'quiz',ok);
  if(ok){qOk++;if(errCount[wi]>0)errCount[wi]=Math.max(0,errCount[wi]-1);}
  else{btn.classList.add('wrong');qNg++;errCount[wi]=(errCount[wi]||0)+1;trackWrongWord(words[wi]?.word,words[wi]?.meaning);}
  updateQStats();repeatBanner('q-rq-banner','q-repeat',errCount);renderWordList();LS.save();
  const fb=document.getElementById('qfb');fb.className='feedback-box '+(ok?'ok':'ng');fb.style.display='block';
  const w=words[wi],pal=palette(wi);
  fb.innerHTML=`<div class="fb-top ${ok?'ok':'ng'}">${ok?'🎉 정답이에요!':`❌ 틀렸어요. 정답: <strong>${escapeHtml(correct)}</strong>`}</div><div class="fb-scene"><canvas id="qfbcanvas"></canvas></div><div id="qfbai"><div class="ai-loading">AI 연상법 로딩 중</div></div>`;
  setTimeout(()=>{const c=document.getElementById('qfbcanvas');if(c)drawScene(c,w.word,w.meaning,pal);},30);
  const ai=await getAI(w.word,w.meaning);const el=document.getElementById('qfbai');if(!el)return;
  renderAiText(el,[{label:'🖼 연상 장면',className:'mem-lbl',text:ai.scene},{label:'💡 기억법',className:'mem-lbl2',text:ai.memory}]);
  const nxt=document.getElementById('qnext');if(nxt)nxt.style.display='block';
  // 엔터 → 다음 문제
  if(!_qEnterBound){_qEnterBound=true;document.addEventListener('keydown',_qEnterHandler);}
}
function nextQuiz(){if(_qEnterBound){document.removeEventListener('keydown',_qEnterHandler);_qEnterBound=false;}qIdx++;showQuiz();}

/* ─── TYPE ───────────────────────────────────────────── */
function initType(){if(!words.length){document.getElementById('type-body').innerHTML='<div class="empty-msg" style="padding:3rem">단어를 먼저 입력해주세요</div>';return;}tQueue=buildQueue([...Array(words.length).keys()],errCount);tIdx=0;tOk=0;tNg=0;repeatBanner('t-rq-banner','t-repeat',errCount);updateTStats();showType();}
function updateTStats(){document.getElementById('t-ok').textContent=tOk;document.getElementById('t-ng').textContent=tNg;}
function showType(){
  if(tIdx>=tQueue.length){
    const pct=Math.round((tOk/(tOk+tNg||1))*100);
    const wrongIdxs=[...new Set(Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length))];
    document.getElementById('type-body').innerHTML=`<div class="complete-box">
      <span class="complete-emoji">${pct>=80?'✨':pct>=50?'📝':'💪'}</span>
      <div class="complete-title">받아쓰기 완료! ${pct}점</div>
      <div class="complete-sub">정답 ${tOk} · 오답 ${tNg}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" onclick="initType()">다시 풀기</button>
        ${wrongIdxs.length?`<button class="btn" style="border-color:var(--red);color:var(--red)" onclick="reviewType()">🔁 복습하기 (${wrongIdxs.length}개)</button>`:''}
      </div>
    </div>`;
    return;
  }
  const wi=tQueue[tIdx],w=words[wi],isR=(errCount[wi]||0)>0;
  document.getElementById('type-body').innerHTML=`<div class="tword-card" id="tcard">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="tmeaning">${escapeHtml(w.meaning)}</div><div class="hint-boxes" id="hboxes">${w.word.split('').map((ch,i)=>`<div class="hbox${i===0?' ok2':''}" id="hb${i}">${i===0?escapeHtml(ch.toUpperCase()):' '}</div>`).join('')}</div></div><div class="tinput-row" id="tinput-row"><input class="tinput" id="tinput" type="text" placeholder="영어로 입력..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/><button class="btn" id="tchk" onclick="checkType(${wi})">확인</button></div><div class="feedback-box" id="tfb"></div><div id="tai-out"></div><button class="btn btn-wide" id="tnext" style="display:none;margin-top:.25rem" onclick="nextType()">다음 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
  const inp=document.getElementById('tinput');inp.focus();const tgt=w.word.toLowerCase();
  inp.addEventListener('input',()=>{const val=inp.value.toLowerCase();w.word.split('').forEach((_,i)=>{const hb=document.getElementById('hb'+i);if(!hb)return;if(i===0){hb.textContent=w.word[0].toUpperCase();hb.className='hbox ok2';return;}if(i<val.length){hb.textContent=inp.value[i]||'';hb.className='hbox '+(val[i]===tgt[i]?'ok2':'ng2');}else if(i===val.length){hb.textContent=' ';hb.className='hbox cur';}else{hb.textContent=' ';hb.className='hbox';}});});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){const nxt=document.getElementById('tnext');if(nxt&&nxt.style.display!=='none'){nextType();}else{checkType(wi);}}});
}
function reviewType(){
  const wrongIdxs=[...new Set(Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length))];
  if(!wrongIdxs.length)return;
  tQueue=wrongIdxs.sort(()=>Math.random()-.5);tIdx=0;tOk=0;tNg=0;
  repeatBanner('t-rq-banner','t-repeat',errCount);updateTStats();showType();}
async function checkType(wi){
  const inp=document.getElementById('tinput');const val=inp.value.trim();if(!val)return;
  inp.disabled=true;const chk=document.getElementById('tchk');if(chk)chk.disabled=true;
  // 채점 후 입력란 숨기기
  const row=document.getElementById('tinput-row');if(row)row.style.display='none';
  const w=words[wi],ok=val.toLowerCase()===w.word.toLowerCase();recordResult(w._itemType||'word',w.word,w.meaning,'type',ok,selection.sourceIds,w._itemId);
  inp.classList.add(ok?'tok':'tng');
  w.word.split('').forEach((ch,i)=>{const hb=document.getElementById('hb'+i);if(hb){hb.textContent=ch;hb.className='hbox '+(ok?'ok2':'ng2');}});
  if(ok){tOk++;if(errCount[wi]>0)errCount[wi]=Math.max(0,errCount[wi]-1);}
  else{tNg++;errCount[wi]=(errCount[wi]||0)+1;trackWrongWord(w.word,w.meaning);const tc=document.getElementById('tcard');if(tc){tc.classList.add('shake');setTimeout(()=>tc.classList.remove('shake'),300);}}
  updateTStats();repeatBanner('t-rq-banner','t-repeat',errCount);renderWordList();LS.save();
  const fb=document.getElementById('tfb');fb.className='feedback-box '+(ok?'ok':'ng');fb.style.display='block';
  const pal=palette(wi);
  fb.innerHTML=`<div class="fb-top ${ok?'ok':'ng'}">${ok?'🎉 정답이에요!':`❌ 틀렸어요. 정답: <strong>${escapeHtml(w.word)}</strong> (${escapeHtml(w.meaning)})`}</div><div class="fb-scene"><canvas id="tfbcanvas"></canvas></div><div id="tfbai"><div class="ai-loading">AI 연상법 로딩 중</div></div>`;
  setTimeout(()=>{const c=document.getElementById('tfbcanvas');if(c)drawScene(c,w.word,w.meaning,pal);},30);
  const ai=await getAI(w.word,w.meaning);const el=document.getElementById('tfbai');if(!el)return;
  renderAiText(el,[{label:'🖼 연상 장면',className:'mem-lbl',text:ai.scene},{label:'💡 기억법',className:'mem-lbl2',text:ai.memory}]);
  document.getElementById('tnext').style.display='block';
}
function nextType(){tIdx++;showType();}

/* ─── SENT HELPERS ───────────────────────────────────── */
function pickBlank(en){
  // 구두점 제거 후 단어 배열
  const ws=en.replace(/[.,!?'"]/g,'').split(/\s+/).filter(w=>w.length>0);
  // 우선순위: 4글자 이상 → 3글자 이상 → 2글자 이상 → 그냥 아무거나
  const pick=(minLen)=>ws.filter(w=>w.length>=minLen);
  const cands=pick(4).length?pick(4):pick(3).length?pick(3):pick(2).length?pick(2):ws;
  // 관사(a/an/the), be동사(is/are/was) 제외
  const skip=new Set(['a','an','the','is','are','was','were','be','i','at','on','in','of','to','by','do']);
  const filtered=cands.filter(w=>!skip.has(w.toLowerCase()));
  const pool=filtered.length?filtered:cands;
  return pool[Math.floor(Math.random()*pool.length)];
}
function normalize(s){return s.toLowerCase().replace(/[.,!?'"]/g,'').replace(/\s+/g,' ').trim();}
function wordDiff(input,correct){const iW=input.split(/\s+/);const cW=correct.replace(/[.,!?'"]/g,'').split(/\s+/);return iW.map((w,i)=>{const c=w.replace(/[.,!?'"]/g,'').toLowerCase();const cc=(cW[i]||'').toLowerCase();return c===cc?`<span class="diff-ok">${w}</span>`:`<span class="diff-ng">${w}</span>`;}).join(' ');}

/* ─── USER SENT ──────────────────────────────────────── */
function setSentModeAndGo(m,src){sentMode=m;const t=document.getElementById('sent-mode-title');if(t)t.textContent=m==='blank'?'✏️ 문장 빈칸 채우기':'📝 문장 전체 받아쓰기';go('sent');}
function initSent(){if(!sents.length){document.getElementById('sent-body').innerHTML=`<div class="empty-msg" style="padding:3rem">문장을 먼저 입력해주세요<br><button class="btn" style="margin-top:.75rem" onclick="go('input');switchInputMode('sent')">문장 추가하러 가기</button></div>`;return;}sQueue=buildQueue([...Array(sents.length).keys()],sErrCount);sIdx=0;sOk=0;sNg=0;updateSStats();showSent();}
function updateSStats(){document.getElementById('s-ok').textContent=sOk;document.getElementById('s-ng').textContent=sNg;document.getElementById('s-prog').textContent=`${sIdx}/${sQueue.length}`;}
function showSent(){
  if(sIdx>=sQueue.length){
    const pct=Math.round((sOk/(sOk+sNg||1))*100);
    const wrongIdxs=[...new Set(Object.keys(sErrCount).filter(k=>sErrCount[k]>0).map(Number).filter(i=>i<sents.length))];
    document.getElementById('sent-body').innerHTML=`<div class="complete-box">
      <span class="complete-emoji">${pct>=80?'🏆':pct>=50?'👍':'💪'}</span>
      <div class="complete-title">문장 학습 완료! ${pct}점</div>
      <div class="complete-sub">정답 ${sOk} · 오답 ${sNg}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" onclick="initSent()">다시 풀기</button>
        ${wrongIdxs.length?`<button class="btn" style="border-color:var(--red);color:var(--red)" onclick="reviewSent()">🔁 복습하기 (${wrongIdxs.length}개)</button>`:''}
        <button class="btn" onclick="go('input');switchInputMode('sent')">문장 추가</button>
      </div>
    </div>`;
    return;
  }
  const si=sQueue[sIdx],s=sents[si],isR=(sErrCount[si]||0)>0;
  updateSStats();
  if(sentMode==='blank')showSentBlank(si,s,isR,'sent-body','s');
  else showSentFull(si,s,isR,'sent-body','s');
}
function reviewSent(){
  const wrongIdxs=[...new Set(Object.keys(sErrCount).filter(k=>sErrCount[k]>0).map(Number).filter(i=>i<sents.length))];
  if(!wrongIdxs.length)return;
  sQueue=wrongIdxs.sort(()=>Math.random()-.5);sIdx=0;sOk=0;sNg=0;updateSStats();showSent();
}
function showSentBlank(si,s,isR,bodyId,prefix){
  const blank=pickBlank(s.en);
  const wparts=s.en.split(/(\s+)/);
  let replaced=false;
  const dispParts=wparts.map(part=>{
    if(!replaced&&part.replace(/[.,!?'"]/g,'').toLowerCase()===blank.toLowerCase()){
      replaced=true;return '<span class="blank-word">_____</span>';
    }
    return escapeHtml(part);
  });
  if(!replaced){
    const nonSpace=dispParts.filter(p=>!/^\s+$/.test(p));
    if(nonSpace.length){const last=nonSpace[nonSpace.length-1];const lastIdx=dispParts.lastIndexOf(last);dispParts[lastIdx]='<span class="blank-word">_____</span>';}
  }
  const disp=dispParts.join('');
  document.getElementById(bodyId).innerHTML=`<div class="sent-card" id="${prefix}card">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="sent-mode-label">빈칸 채우기</div><div class="sent-ko-display">${escapeHtml(s.ko)}</div><div class="blank-sentence">${disp}</div></div><div class="blank-input-wrap" id="${prefix}binp-row"><input class="blank-input" id="${prefix}binp" type="text" placeholder="빈칸에 들어갈 단어" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-blank="${escapeHtml(blank)}" data-si="${si}" data-prefix="${prefix}"/><button class="btn" id="${prefix}bchk" onclick="checkBlank('${prefix}')">확인</button></div><div class="feedback-box" id="${prefix}fb"></div><button class="btn btn-wide" id="${prefix}next" style="display:none;margin-top:.25rem" onclick="next_${prefix}()">다음 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
  const inp=document.getElementById(prefix+'binp');inp.focus();
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      const nxt=document.getElementById(prefix+'next');
      if(nxt&&nxt.style.display!=='none'){next_safe(prefix);}else{checkBlank(prefix);}
    }
  });
}
function checkBlank(prefix){
  const inp=document.getElementById(prefix+'binp');const val=inp.value.trim();if(!val)return;
  const blank=inp.dataset.blank;const si=parseInt(inp.dataset.si);
  // 채점 후 입력란+버튼 숨기기
  const row=document.getElementById(prefix+'binp-row');if(row)row.style.display='none';
  inp.disabled=true;
  const isUser=(prefix==='s'),src=isUser?sents[si]:getToeicSents()[si];
  const ok=normalize(val)===normalize(blank);recordResult('sentence',src.en,src.ko,'blank',ok,prefix==='ts'?selection.sourceIds:['mine_sentences'],src._itemId);
  if(isUser){
    if(ok){sOk++;if(sErrCount[si]>0)sErrCount[si]=Math.max(0,sErrCount[si]-1);}
    else{sNg++;sErrCount[si]=(sErrCount[si]||0)+1;trackWrongWord(blank,null);}
    updateSStats();renderSentList();LS.save();
  }else{
    if(ok){tsOk++;if(toeicErrCount[si]>0)toeicErrCount[si]=Math.max(0,toeicErrCount[si]-1);}
    else{tsNg++;toeicErrCount[si]=(toeicErrCount[si]||0)+1;}
    updateTsStats();
  }
  const fb=document.getElementById(prefix+'fb');fb.style.display='block';fb.className='feedback-box '+(ok?'ok':'ng');
  // 틀린 경우: 정답 단어 뜻도 표시 (단어장에서 찾기)
  let blankMeaning='';
  if(!ok){
    const found=words.find(w=>w.word.toLowerCase()===blank.toLowerCase());
    if(found)blankMeaning=` (뜻: ${found.meaning})`;
  }
  fb.innerHTML=`<div class="fb-top ${ok?'ok':'ng'}">${ok?'🎉 정답이에요!':`❌ 정답: <strong>${escapeHtml(blank)}</strong>${escapeHtml(blankMeaning)}`}</div><div style="font-size:.78rem;color:var(--text2);font-weight:600;line-height:1.7;margin-top:.4rem">${escapeHtml(src.en)}<br><span style="color:var(--text3)">${escapeHtml(src.ko)}</span></div>`;
  document.getElementById(prefix+'next').style.display='block';
}
function showSentFull(si,s,isR,bodyId,prefix){
  document.getElementById(bodyId).innerHTML=`<div class="sent-card" id="${prefix}card">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="sent-mode-label">전체 받아쓰기</div><div class="sent-ko-display">${escapeHtml(s.ko)}</div></div><div id="${prefix}full-input-wrap"><textarea class="full-sent-textarea" id="${prefix}finp" placeholder="영어 문장 전체 입력... (Ctrl+Enter로 채점)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea><button class="btn primary btn-wide" id="${prefix}fchk" onclick="checkFull('${prefix}',${si})" style="margin-bottom:.75rem">채점하기</button></div><div class="feedback-box" id="${prefix}fb"></div><button class="btn btn-wide" id="${prefix}next" style="display:none;margin-top:.25rem" onclick="next_${prefix}()">다음 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
  const ta=document.getElementById(prefix+'finp');ta.focus();
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){
      const nxt=document.getElementById(prefix+'next');
      if(nxt&&nxt.style.display!=='none'){next_safe(prefix);}else{checkFull(prefix,si);}
    }
  });
}
function checkFull(prefix,si){
  const ta=document.getElementById(prefix+'finp');const val=ta.value.trim();if(!val)return;
  ta.disabled=true;
  // 채점 후 입력란+채점버튼 숨기기
  const wrap=document.getElementById(prefix+'full-input-wrap');if(wrap)wrap.style.display='none';
  const isUser=(prefix==='s');const src=isUser?sents[si]:getToeicSents()[si];
  const ok=normalize(val)===normalize(src.en);recordResult('sentence',src.en,src.ko,'full',ok,prefix==='ts'?selection.sourceIds:['mine_sentences'],src._itemId);ta.classList.add(ok?'tok':'tng');
  if(isUser){
    if(ok){sOk++;if(sErrCount[si]>0)sErrCount[si]=Math.max(0,sErrCount[si]-1);}
    else{sNg++;sErrCount[si]=(sErrCount[si]||0)+1;}
    updateSStats();renderSentList();LS.save();
  }else{
    if(ok){tsOk++;if(toeicErrCount[si]>0)toeicErrCount[si]=Math.max(0,toeicErrCount[si]-1);}
    else{tsNg++;toeicErrCount[si]=(toeicErrCount[si]||0)+1;}
    updateTsStats();
  }
  const fb=document.getElementById(prefix+'fb');fb.style.display='block';fb.className='feedback-box '+(ok?'ok':'ng');
  if(ok){fb.innerHTML=`<div class="fb-top ok">🎉 완벽해요!</div>`;}
  else{
    // 틀린 단어 뜻 찾기 + trackWrongWord
    const iWords=val.replace(/[.,!?'"]/g,'').split(/\s+/);
    const cWords=src.en.replace(/[.,!?'"]/g,'').split(/\s+/);
    const diffHtml=iWords.map((w,i)=>{
      const c=w.toLowerCase(),cc=(cWords[i]||'').toLowerCase();
      if(c===cc)return`<span class="diff-ok">${escapeHtml(w)}</span>`;
      trackWrongWord(cWords[i],null);
      const found=words.find(wd=>wd.word.toLowerCase()===cc);
      const tip=found?` <span style="font-size:.62rem;color:var(--amber)">(${escapeHtml(found.meaning)})</span>`:'';
      return`<span class="diff-ng">${escapeHtml(w)}</span>${tip}`;
    }).join(' ');
    fb.innerHTML=`<div class="fb-top ng">❌ 틀렸어요.</div><div style="font-size:.72rem;color:var(--text3);margin-bottom:.35rem;font-weight:700">내가 쓴 답 (빨간=틀림, 노란=뜻)</div><div class="diff-result">${diffHtml}</div><div style="font-size:.72rem;color:var(--text3);margin:.5rem 0 .3rem;font-weight:700">정답</div><div style="font-size:.82rem;font-weight:700;color:var(--green);line-height:1.7">${escapeHtml(src.en)}</div>`;
  }
  document.getElementById(prefix+'next').style.display='block';
}
function next_safe(prefix){if(prefix==='s'){sIdx++;showSent();}else if(prefix==='ts'){tsIdx++;showToeic();}}
// next functions for each prefix
window.next_s=function(){sIdx++;showSent();};
window.next_ts=function(){tsIdx++;showToeic();};

/* ─── TOEIC SENT ─────────────────────────────────────── */
function initToeic(){
  const s=getToeicSents();
  if(!s.length){document.getElementById('toeic-body').innerHTML=`<div class="empty-msg" style="padding:3rem">파트를 먼저 선택해주세요<br><button class="btn" style="margin-top:.75rem" onclick="go('input');switchInputMode('toeic')">파트 선택하러 가기</button></div>`;return;}
  tsQueue=buildQueue([...Array(s.length).keys()],toeicErrCount);tsIdx=0;tsOk=0;tsNg=0;updateTsStats();showToeic();
}
function updateTsStats(){document.getElementById('ts-ok').textContent=tsOk;document.getElementById('ts-ng').textContent=tsNg;document.getElementById('ts-prog').textContent=`${tsIdx}/${tsQueue.length}`;}
function showToeic(){
  if(tsIdx>=tsQueue.length){
    const pct=Math.round((tsOk/(tsOk+tsNg||1))*100);
    const wrongIdxs=[...new Set(Object.keys(toeicErrCount).filter(k=>toeicErrCount[k]>0).map(Number).filter(i=>i<getToeicSents().length))];
    document.getElementById('toeic-body').innerHTML=`<div class="complete-box">
      <span class="complete-emoji">${pct>=80?'🏆':pct>=50?'👍':'💪'}</span>
      <div class="complete-title">토익스피킹 학습 완료! ${pct}점</div>
      <div class="complete-sub">정답 ${tsOk} · 오답 ${tsNg}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" onclick="initToeic()">다시 풀기</button>
        ${wrongIdxs.length?`<button class="btn" style="border-color:var(--red);color:var(--red)" onclick="reviewToeic()">🔁 복습하기 (${wrongIdxs.length}개)</button>`:''}
        <button class="btn" onclick="go('input');switchInputMode('toeic')">파트 변경</button>
      </div>
    </div>`;
    return;
  }
  const si=tsQueue[tsIdx],s=getToeicSents()[si],isR=(toeicErrCount[si]||0)>0;
  updateTsStats();
  if(toeicSentMode==='blank')showSentBlank(si,s,isR,'toeic-body','ts');
  else showSentFull(si,s,isR,'toeic-body','ts');
}
function reviewToeic(){
  const wrongIdxs=[...new Set(Object.keys(toeicErrCount).filter(k=>toeicErrCount[k]>0).map(Number).filter(i=>i<getToeicSents().length))];
  if(!wrongIdxs.length)return;
  tsQueue=wrongIdxs.sort(()=>Math.random()-.5);tsIdx=0;tsOk=0;tsNg=0;updateTsStats();showToeic();
}

/* ─── VOICE MODE ──────────────────────────────────────── */
let voiceSource='toeic'; // 'toeic' | 'user'
let vQueue=[],vIdx=0,vOk=0,vNg=0;
let vRetryCnt=0;
let recognition=null;
let isRecording=false;
let speechSynth=window.speechSynthesis;
let vStartTime=null;

function goToeicLearn(m){
  if(m==='voice'){go('voice');return;}
  toeicSentMode=m;
  const t=document.getElementById('toeic-mode-title');
  if(t)t.textContent=m==='blank'?'🎙 토익 빈칸 채우기':'🎙 토익 전체 받아쓰기';
  go('toeic');
}

function setVoiceSource(src){
  voiceSource=src;
  document.getElementById('vst-toeic').classList.toggle('active',src==='toeic');
  document.getElementById('vst-user').classList.toggle('active',src==='user');
  initVoice();
}

function getVoiceSents(){
  if(voiceSource==='toeic') return getToeicSents();
  return sents.length?sents:[];
}

function initVoice(){
  stopVoiceMode();
  const s=getVoiceSents();
  if(!s.length){
    document.getElementById('voice-body').innerHTML=`<div class="empty-msg" style="padding:3rem">
      ${voiceSource==='toeic'?'파트를 먼저 선택해주세요<br><button class="btn" style="margin-top:.75rem" onclick="go(\'input\');switchInputMode(\'toeic\')">파트 선택</button>':'문장을 먼저 추가해주세요<br><button class="btn" style="margin-top:.75rem" onclick="go(\'input\');switchInputMode(\'sent\')">문장 추가</button>'}
    </div>`;
    return;
  }
  // shuffle queue
  vQueue=[...Array(s.length).keys()].sort(()=>Math.random()-.5);
  vIdx=0;vOk=0;vNg=0;vRetryCnt=0;
  updateVStats();showVoice();
}

function updateVStats(){
  document.getElementById('v-ok').textContent=vOk;
  document.getElementById('v-ng').textContent=vNg;
  document.getElementById('v-prog').textContent=`${vIdx}/${vQueue.length}`;
}

function showVoice(){
  if(vIdx>=vQueue.length){
    const pct=Math.round((vOk/(vOk+vNg||1))*100);
    document.getElementById('voice-body').innerHTML=`<div class="complete-box">
      <span class="complete-emoji">${pct>=80?'🏆':pct>=50?'👍':'💪'}</span>
      <div class="complete-title">음성 학습 완료! ${pct}점</div>
      <div class="complete-sub">정답 ${vOk} · 오답 ${vNg}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" onclick="initVoice()">다시 풀기</button>
        <button class="btn" onclick="go('learn')">모드 선택</button>
      </div>
    </div>`;
    return;
  }
  vRetryCnt=0;
  const si=vQueue[vIdx];
  const s=getVoiceSents()[si];
  updateVStats();
  renderVoiceCard(s,si);
}

function renderVoiceCard(s,si){
  document.getElementById('voice-body').innerHTML=`
    <div class="voice-card">
      <div class="voice-progress">${vIdx+1} / ${vQueue.length} 번째 문장</div>
      <div class="voice-ko">${escapeHtml(s.ko)}</div>
      <div style="font-size:.7rem;color:var(--text3);font-weight:700;margin-bottom:.5rem">위 한국어를 영어로 말해보세요</div>

      <!-- 힌트: 정답 문장 보기/가리기 -->
      <div style="margin-bottom:1rem">
        <button class="shadow-btn" id="hintBtn" onclick="toggleHint()" style="font-size:.72rem;padding:6px 14px;">
          💡 정답 힌트 보기
        </button>
        <div id="hintBox" style="display:none;margin-top:.5rem;padding:.625rem .875rem;background:var(--amber-bg);border:1px solid rgba(245,166,35,.25);border-radius:var(--r-sm);font-size:.82rem;font-weight:700;color:var(--amber);line-height:1.6;word-break:break-word;">
          ${escapeHtml(s.en)}
        </div>
      </div>

      <div class="mic-wrap">
        <button class="mic-btn" id="micBtn"
          onpointerdown="pttStart(${si})" onpointerup="pttEnd(${si})" onpointercancel="pttEnd(${si})"
          oncontextmenu="return false" aria-label="마이크 — 누르는 동안 녹음">
          <span class="mic-icon">🎤</span>
        </button>
        <span class="mic-label" id="micLabel">누르고 있는 동안 녹음</span>
      </div>
      <button class="shadow-btn" id="shadowBtn">
        🔊 섀도잉 — 먼저 듣기
      </button>
    </div>
    <div class="stt-result" id="sttResult">인식된 음성이 여기에 표시돼요...</div>
    <div class="voice-feedback" id="voiceFeedback"></div>
    <div class="voice-actions" id="voiceActions" style="display:none">
      <button class="retry-btn" onclick="retryVoice(${si})">🔄 다시 말하기</button>
      <button class="next-btn-v" onclick="nextVoice()">다음 문장 →</button>
    </div>
    <div class="retry-count" id="retryCnt"></div>
  `;
  document.getElementById('shadowBtn')?.addEventListener('click',()=>playShadow(s.en));
}

function toggleHint(){
  const box=document.getElementById('hintBox');
  const btn=document.getElementById('hintBtn');
  if(!box||!btn)return;
  const showing=box.style.display!=='none';
  box.style.display=showing?'none':'block';
  btn.textContent=showing?'💡 정답 힌트 보기':'🙈 힌트 가리기';
}

/* 섀도잉 — TTS로 먼저 들려주기 */
function playShadow(text){
  if(!speechSynth)return;
  speechSynth.cancel();
  const utt=new SpeechSynthesisUtterance(text);
  utt.lang='en-US';utt.rate=0.9;utt.pitch=1;
  const btn=document.getElementById('shadowBtn');
  if(btn)btn.classList.add('playing');
  utt.onend=()=>{if(btn)btn.classList.remove('playing');};
  speechSynth.speak(utt);
}

/* 브라우저 감지 */
const isSafari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent)||
  (/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream);
const isChrome=!isSafari&&(!!window.chrome||navigator.userAgent.includes('Chrome'));

/* PTT — 누르는 동안 녹음, 떼면 자동 채점 */
let _pttSi=null;      // 현재 문제 인덱스
let _pttReleased=false; // 손을 뗐는지 여부

function pttStart(si){
  if(isRecording)return;
  _pttSi=si;
  _pttReleased=false;
  startRecording(si);
}

function pttEnd(si){
  _pttReleased=true;
  if(!isRecording)return;
  isRecording=false; // onend 중복처리 방지
  if(vSilenceTimer){clearTimeout(vSilenceTimer);vSilenceTimer=null;}
  // 손 뗀 시점의 화면 텍스트를 snapshot으로 저장 (onend 전에 확보)
  const res=document.getElementById('sttResult');
  if(res&&res.classList.contains('has-text')){
    vInterimSnapshot=res.textContent.trim();
  }
  const btn=document.getElementById('micBtn');
  const lbl=document.getElementById('micLabel');
  if(btn)btn.classList.remove('recording');
  if(lbl)lbl.textContent='처리 중...';
  if(recognition){try{recognition.stop();}catch(e){}}
}

let vSilenceTimer=null;
let vFinalTranscript='';
let vInterimSnapshot=''; // pttEnd 시점의 interim 텍스트 보존

function startRecording(si){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    const res=document.getElementById('sttResult');
    if(res)res.textContent='⚠️ 이 브라우저는 음성 인식을 지원하지 않아요. Chrome 또는 Safari(iOS 14.5+)를 사용해주세요.';
    return;
  }
  recognition=new SpeechRecognition();
  recognition.lang='en-US';
  recognition.maxAlternatives=1;
  recognition.continuous=true;    // 시간 제한 없음 — 손 뗄 때까지 계속
  recognition.interimResults=true;

  const btn=document.getElementById('micBtn');
  const lbl=document.getElementById('micLabel');
  const res=document.getElementById('sttResult');
  if(btn)btn.classList.add('recording');
  if(lbl)lbl.textContent='🔴 녹음 중... (손 떼면 채점)';
  if(res){res.textContent='🎙 듣고 있어요...';res.classList.remove('has-text');}
  isRecording=true;
  _pttReleased=false;
  vStartTime=Date.now();
  vFinalTranscript='';
  vInterimSnapshot='';

  recognition.onresult=(e)=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) vFinalTranscript+=e.results[i][0].transcript+' ';
      else interim+=e.results[i][0].transcript;
    }
    const display=(vFinalTranscript+interim).trim();
    // interim도 항상 snapshot에 저장 — pttEnd 시점에 못 잡을 경우 대비
    vInterimSnapshot=display;
    if(res&&display){res.textContent=display;res.classList.add('has-text');}
  };

  recognition.onerror=(e)=>{
    if(e.error==='aborted'||e.error==='no-speech'){
      // aborted = pttEnd의 정상 중단, no-speech = 말 중간 묵음
      // 둘 다 onend가 이어서 처리하므로 여기선 아무것도 안 함
      return;
    }
    isRecording=false;
    if(btn)btn.classList.remove('recording');
    if(lbl)lbl.textContent='누르고 있는 동안 녹음';
    const msg={
      'not-allowed':'마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요.',
      'network':'네트워크 오류가 발생했어요. HTTPS 환경에서 사용해주세요.',
    }[e.error]??`오류: ${e.error}`;
    if(res)res.textContent=`⚠️ ${msg}`;
  };

  recognition.onend=()=>{
    // 아직 손 안 뗀 상태 + 아직 recording 중 → 자동 재시작 (브라우저 강제 종료 대응)
    if(!_pttReleased&&isRecording){
      try{recognition.start();}catch(e){}
      return;
    }

    // 손 뗀 후 → 채점
    isRecording=false;
    if(btn)btn.classList.remove('recording');

    // vFinalTranscript 우선, 없으면 interim snapshot, 없으면 화면 텍스트
    const transcript=(
      vFinalTranscript.trim() ||
      vInterimSnapshot.trim() ||
      (res&&res.classList.contains('has-text')?res.textContent.trim():'')
    ).replace(/^🎙.*/,'').trim();

    if(lbl)lbl.textContent='누르고 있는 동안 녹음';

    if(!transcript){
      if(res)res.textContent='⚠️ 음성이 감지되지 않았어요. 다시 눌러서 말해보세요.';
      return;
    }

    const elapsed=((Date.now()-vStartTime)/1000).toFixed(1);
    checkVoiceAnswer(si,transcript,elapsed);
  };

  try{
    recognition.start();
  }catch(e){
    isRecording=false;
    if(btn)btn.classList.remove('recording');
    if(lbl)lbl.textContent='누르고 있는 동안 녹음';
    if(res)res.textContent='⚠️ 마이크를 시작할 수 없어요. 잠시 후 다시 눌러보세요.';
  }
}

function stopRecording(si,manual){
  if(vSilenceTimer){clearTimeout(vSilenceTimer);vSilenceTimer=null;}
  isRecording=false;
  if(recognition){try{recognition.stop();}catch(e){}}
  const btn=document.getElementById('micBtn');
  const lbl=document.getElementById('micLabel');
  if(btn)btn.classList.remove('recording');
  if(lbl)lbl.textContent='누르고 있는 동안 녹음';
}

function stopVoiceMode(){
  isRecording=false;
  _pttReleased=true;
  if(vSilenceTimer){clearTimeout(vSilenceTimer);vSilenceTimer=null;}
  if(recognition){try{recognition.abort();}catch(e){}}
  if(speechSynth)speechSynth.cancel();
}

async function checkVoiceAnswer(si,userAnswer,elapsed){
  const s=getVoiceSents()[si];
  const fb=document.getElementById('voiceFeedback');
  const actions=document.getElementById('voiceActions');
  const sttRes=document.getElementById('sttResult');

  if(!fb)return;
  fb.style.display='block';
  fb.className='voice-feedback';
  fb.innerHTML=`<div class="ai-loading">AI 채점 중</div>`;

  // 서버 AI가 설정되지 않은 정적 앱에서는 로컬 전사 유사도만 명시적으로 사용한다.
  const norm=t=>t.toLowerCase().replace(/[.,!?'"]/g,'').replace(/\s+/g,' ').trim();
  const uWords=norm(userAnswer).split(' '),cWords=norm(s.en).split(' ');
  const similarity=uWords.filter(w=>cWords.includes(w)).length/Math.max(cWords.length,1);
  const result={correct:similarity>=0.75,reason:similarity>=0.75?'전사 내용이 목표 문장과 유사해요.':'전사를 확인하거나 텍스트로 다시 시도하세요.'};

  const ok=result.correct;
  recordResult('sentence',s.en,s.ko,'speak',ok,selection.sourceIds,s._itemId);
  if(ok){vOk++;}else{vNg++;}
  updateVStats();

  // 단어별 diff 하이라이트 (정답 단어 뜻도 표시)
  const userWords=userAnswer.trim().split(/\s+/);
  const correctWords=s.en.replace(/[.,!?'"]/g,'').split(/\s+/);
  const highlighted=userWords.map((w,i)=>{
    const clean=w.replace(/[.,!?'"]/g,'').toLowerCase();
    const cClean=(correctWords[i]||'').toLowerCase();
    return clean===cClean
      ?`<span class="stt-word-ok">${escapeHtml(w)}</span>`
      :`<span class="stt-word-ng">${escapeHtml(w)}</span>`;
  }).join(' ');
  if(sttRes){sttRes.innerHTML=highlighted;sttRes.classList.add('has-text');}

  fb.className=`voice-feedback ${ok?'ok':'ng'}`;
  const speedBadge=`<span class="speed-badge">⏱ ${elapsed}초</span>`;
  fb.innerHTML=`
    <div class="vf-top ${ok?'ok':'ng'}">${ok?`🎉 정답이에요! ${speedBadge}`:`❌ 틀렸어요 ${speedBadge}`}</div>
    <div class="vf-reason">${escapeHtml(result.reason)}</div>
    ${!ok?`<div class="vf-correct">✅ 정답: ${escapeHtml(s.en)}</div>`:''}
  `;

  if(actions){
    actions.style.display='flex';
    const retryCnt=document.getElementById('retryCnt');
    if(retryCnt&&vRetryCnt>0)retryCnt.textContent=`재시도 ${vRetryCnt}회`;
  }
}

function retryVoice(si){
  vRetryCnt++;
  isRecording=false;
  _pttReleased=false;
  if(vSilenceTimer){clearTimeout(vSilenceTimer);vSilenceTimer=null;}
  if(recognition){try{recognition.abort();}catch(e){}}
  const btn=document.getElementById('micBtn');
  const lbl=document.getElementById('micLabel');
  if(btn)btn.classList.remove('recording');
  if(lbl)lbl.textContent='누르고 있는 동안 녹음';
  const fb=document.getElementById('voiceFeedback');
  const actions=document.getElementById('voiceActions');
  const sttRes=document.getElementById('sttResult');
  if(fb){fb.style.display='none';}
  if(actions){actions.style.display='none';}
  if(sttRes){sttRes.textContent='인식된 음성이 여기에 표시돼요...';sttRes.classList.remove('has-text');}
  const retryCnt=document.getElementById('retryCnt');
  if(retryCnt)retryCnt.textContent=`재시도 ${vRetryCnt}회`;
}

function nextVoice(){
  isRecording=false;
  if(recognition){try{recognition.abort();}catch(e){}}
  vIdx++;
  showVoice();
}

renderWordList();
renderSentList();

// 마지막 탭 복원 (학습 중이던 화면 유지)
(function(){
  try{
    const lastTab=localStorage.getItem('vm-tab');
    // 학습 진행 중인 탭들은 새로고침 시 learn으로 보냄 (상태 초기화 필요)
    const safeRestore=['input','learn','toeic'];
    if(lastTab&&document.getElementById('s-'+lastTab)){
      go(safeRestore.includes(lastTab)?lastTab:'learn');
    }else go('learn');
  }catch(error){console.error('초기 화면 복원 실패',error);}
  finally{if(!userProfile)document.getElementById('onboardingModal').style.display='flex';}
})();

/* ─── V2 ITEM/SOURCE UI ─────────────────────────────── */
function renderSelection(){
  const host=document.getElementById('source-selector');if(!host)return;
  const visible=catalog.sources.filter(s=>s.id!=='vocab_master_all');host.replaceChildren();
  visible.forEach(source=>{const label=document.createElement('label');label.className='source-option';const box=document.createElement('input');box.type='checkbox';box.checked=selection.sourceIds.includes(source.id);box.addEventListener('change',()=>toggleSource(source.id,box.checked));const name=document.createElement('span');name.textContent=source.name;const count=document.createElement('small');count.textContent=VocabCore.selectItems([source.id],catalog,progressById).length+'개';label.append(box,name,count);host.append(label);});
  const items=VocabCore.selectItems(selection.sourceIds,catalog,progressById),counts=VocabCore.selectCounts(items,progressById);document.getElementById('sel-total').textContent=counts.total;document.getElementById('sel-fresh').textContent=counts.fresh;document.getElementById('sel-due').textContent=counts.due;
  const modes={flash:'플래시카드',quiz:'객관식',type:'뜻→영 입력',blank:'빈칸',full:'전체 받아쓰기',speak:'음성 말하기'},mh=document.getElementById('mode-selector');mh.replaceChildren();Object.entries(modes).forEach(([id,name])=>{const compatible=VocabCore.compatibleItems(items,id),minimum=id==='quiz'?2:1,button=document.createElement('button');button.className='mode-option'+(selection.mode===id?' active':'');button.disabled=compatible.length<minimum;button.textContent=name;const small=document.createElement('small');small.textContent=compatible.length>=minimum?`실제 학습 큐 ${compatible.length}개`:id==='quiz'&&compatible.length===1?'객관식은 단어 2개 이상 필요':'선택 항목 타입과 호환되지 않음';button.append(small);button.addEventListener('click',()=>{selection.mode=id;selection.updatedAt=Date.now();persistV2();renderSelection();});mh.append(button);});
  const today=VocabCore.selectTodayStats(studyEvents),accuracy=today.accuracy??0;document.getElementById('ds-total').textContent=today.attempts;document.getElementById('ds-correct').textContent=today.correct;document.getElementById('ds-review').textContent=counts.due;document.getElementById('dash-ring-pct').textContent=accuracy+'%';document.getElementById('dash-ring-circle').style.strokeDashoffset=163.4-(accuracy/100)*163.4;document.getElementById('dash-sub').textContent=today.attempts?`오늘 ${today.attempts}문제 · 정확도 ${today.accuracy}%`:`선택 항목 ${counts.total}개 · 오늘 복습 ${counts.due}개`;const alert=document.getElementById('dash-review-alert');alert.replaceChildren();alert.style.display=counts.due?'flex':'none';if(counts.due){const message=document.createElement('div');message.className='dash-review-alert';message.textContent=`오늘 복습할 항목이 ${counts.due}개 있어요!`;alert.append(message);}
  const start=document.getElementById('today-start'),queue=VocabCore.compatibleItems(items,selection.mode),canStart=queue.length>=(selection.mode==='quiz'?2:1);start.disabled=!selection.mode||!canStart;document.getElementById('selection-help').textContent=canStart?`선택 Source의 중복을 제거한 ${queue.length}개 항목을 학습합니다.`:'Source와 호환되는 Mode를 선택해주세요.';
}
function ensureTodayPlan(minutes){
  const date=VocabCore.localDate(),timezone=Intl.DateTimeFormat().resolvedOptions().timeZone,profile=userProfile||{goal:'both',dailyMinutes:15,level:'unknown',interests:[],timezone};
  if(!dailyPlan||dailyPlan.localDate!==date||minutes&&dailyPlan.budgetMinutes!==minutes)dailyPlan=VocabCore.createDailyPlan({catalog,progress:progressById,profile,localDate:date,timezone,seed:date,budgetMinutes:minutes});
  if(!dailySession||dailySession.planId!==dailyPlan.planId)dailySession=VocabCore.createSession(dailyPlan);
  return dailyPlan;
}
function renderTodayPlan(){const plan=ensureTodayPlan();const minutes=Math.max(1,Math.ceil(plan.estimatedSeconds/60));document.getElementById('today-duration').textContent=`오늘 약 ${minutes}분`;document.getElementById('today-counts').textContent=`복습 ${plan.counts.review}개 / 새 표현 ${plan.counts.new}개${plan.remainingReviewCount?` / 추가 복습 ${plan.remainingReviewCount}개`:''}`;document.getElementById('today-reasons').textContent=[...new Set(plan.steps.map(step=>step.reason))].join(' · ')||'학습 항목을 보관함에 추가하면 자동으로 계획해요.';const button=document.getElementById('auto-start');button.textContent=dailySession&&!dailySession.completed&&dailySession.cursor>0?'이어하기':'오늘 학습 시작';button.disabled=!plan.steps.length;}
function startToday(minutes){const plan=ensureTodayPlan(minutes),completed=new Set(Object.values(dailySession.results||{}).map(result=>result.taskId)),remaining=plan.steps.filter(step=>!completed.has(step.taskId));if(!remaining.length){dailySession.completed=true;persistV2();renderTodayPlan();return;}const mode=remaining[0].mode,ids=new Set(remaining.filter(step=>step.mode===mode).map(step=>step.itemId)),items=catalog.items.filter(item=>ids.has(item.id));selection={...selection,sourceIds:catalog.sources.filter(source=>source.kind!=='virtual').map(source=>source.id),mode};selectedStudyItems=items;persistV2();if(['flash','type'].includes(mode)){words=items.map(item=>({word:item.en,meaning:item.ko,_itemId:item.id,_itemType:item.type}));errCount={};go(mode);return;}sents=items.map(item=>({en:item.en,ko:item.ko,_itemId:item.id}));sErrCount={};setSentModeAndGo(mode,'user');}
function finishOnboarding(event){event.preventDefault();const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;userProfile={goal:document.getElementById('profileGoal').value,dailyMinutes:Number(document.getElementById('profileMinutes').value),level:document.getElementById('profileLevel').value,interests:document.getElementById('profileInterests').value.split(',').map(value=>value.trim()).filter(Boolean),timezone,createdAt:Date.now()};dailyPlan=null;dailySession=null;document.getElementById('onboardingModal').style.display='none';persistV2();go('learn');}
function toggleSource(id,checked){const set=new Set(selection.sourceIds);checked?set.add(id):set.delete(id);selection={...selection,sourceIds:[...set],updatedAt:Date.now()};persistV2();renderSelection();}
function startSelectedMode(){const items=VocabCore.compatibleItems(VocabCore.selectItems(selection.sourceIds,catalog,progressById),selection.mode);if(!items.length)return;selectedStudyItems=items;if(['flash','quiz','type'].includes(selection.mode)){words=items.map(item=>({word:item.en,meaning:item.ko,_itemId:item.id,_itemType:item.type}));errCount=Object.fromEntries(items.map((item,index)=>[index,progressById[item.id]?.lapses||0]));if(selection.mode==='flash')go('flash');else if(selection.mode==='quiz')go('quiz');else go('type');return;}sents=items.map(item=>({en:item.en,ko:item.ko,_itemId:item.id}));sErrCount=Object.fromEntries(items.map((item,index)=>[index,progressById[item.id]?.lapses||0]));selectedPart=null;selectedCustom=null;if(selection.mode==='speak'){voiceSource='user';go('voice');}else setSentModeAndGo(selection.mode,'user');}
function filterLibrary(query){const q=VocabCore.normalize(query);document.querySelectorAll('#wlist .wi,#slist .wi').forEach(row=>{row.style.display=!q||VocabCore.normalize(row.textContent).includes(q)?'':'none';});}
function parsedBulk(){return document.getElementById('bulk-input').value.split(/\r?\n/).filter(Boolean).map((line,index)=>{const parts=line.split(/\s*[|\t]\s*/);return{line:index+1,en:(parts[0]||'').trim(),ko:(parts.slice(1).join(' | ')||'').trim(),valid:parts.length>1&&parts[0].trim()&&parts[1].trim()};});}
function previewBulk(){const rows=parsedBulk(),valid=rows.filter(row=>row.valid).length,host=document.getElementById('bulk-preview');host.replaceChildren();const summary=document.createElement('div');summary.textContent=`${rows.length}줄 중 ${valid}개 등록 가능 · ${rows.length-valid}개 무효`;host.append(summary);rows.slice(0,20).forEach(row=>{const line=document.createElement('div');line.className=row.valid?'preview-valid':'preview-invalid';line.textContent=row.valid?`${row.line}. ${row.en} → ${row.ko}`:`${row.line}. 구분자(| 또는 탭)와 영어·한국어를 확인하세요.`;host.append(line);});}
function applyBulk(){const rows=parsedBulk().filter(r=>r.valid);if(!rows.length)return previewBulk();const sentenceTab=document.getElementById('sw-sent').classList.contains('active');rows.forEach(r=>sentenceTab?ownedSents.push({en:r.en,ko:r.ko}):ownedWords.push({word:r.en,meaning:r.ko}));words=ownedWords;sents=ownedSents;rebuildCatalog();LS.save();renderWordList();renderSentList();document.getElementById('bulk-input').value='';document.getElementById('bulk-preview').textContent=`${rows.length}개를 학습 목록에 등록했습니다.`;}
function exportData(){const json=repository.exportJson(catalog,{progress:progressById,events:studyEvents,selection,profile:userProfile,plan:dailyPlan,session:dailySession}),blob=new Blob([json],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`vocabmaster-${VocabCore.localDate()}.json`;a.click();URL.revokeObjectURL(a.href);}
async function importData(file){const out=document.getElementById('import-report');if(!file)return;const text=await file.text(),report=repository.previewImport(text,catalog);out.textContent=report.valid?`신규 ${report.newCount} · 중복 ${report.duplicateCount} · 충돌 ${report.conflictCount} · 무효 ${report.invalidCount}`:report.error;if(!report.valid||!confirm(out.textContent+'\n이 백업을 병합할까요?'))return;(report.data.items||[]).forEach(item=>{if(catalog.items.some(i=>i.id===item.id))return;const sources=(report.data.memberships||[]).filter(m=>m.itemId===item.id).map(m=>m.sourceId);if(sources.includes('mine_words'))ownedWords.push({word:item.en,meaning:item.ko});if(sources.includes('mine_sentences'))ownedSents.push({en:item.en,ko:item.ko});});rebuildCatalog();const snapshot=repository.applyImport(report,catalog);progressById=snapshot.progress;studyEvents=snapshot.events;selection=snapshot.selection||selection;userProfile=snapshot.profile||userProfile;dailyPlan=snapshot.plan;dailySession=snapshot.session;LS.save();renderWordList();renderSentList();out.textContent+=' · 적용 완료';}

function editWord(index){const word=ownedWords[index],oldItem=currentItem('word',word.word,word.meaning),en=prompt('영어 단어를 수정하세요.',word.word);if(en===null)return;const ko=prompt('뜻을 수정하세요.',word.meaning);if(ko===null||!en.trim()||!ko.trim())return;ownedWords[index]={word:en.trim(),meaning:ko.trim()};rebuildCatalog();const next=currentItem('word',en,ko);if(oldItem&&next&&progressById[oldItem.id]&&!progressById[next.id]){progressById[next.id]=progressById[oldItem.id];delete progressById[oldItem.id];}LS.save();persistV2();renderWordList();}
function editSent(index){const sentence=ownedSents[index],oldItem=currentItem('sentence',sentence.en,sentence.ko),en=prompt('영어 문장을 수정하세요.',sentence.en);if(en===null)return;const ko=prompt('한국어 뜻을 수정하세요.',sentence.ko);if(ko===null||!en.trim()||!ko.trim())return;ownedSents[index]={en:en.trim(),ko:ko.trim()};rebuildCatalog();const next=currentItem('sentence',en,ko);if(oldItem&&next&&progressById[oldItem.id]&&!progressById[next.id]){progressById[next.id]=progressById[oldItem.id];delete progressById[oldItem.id];}LS.save();persistV2();renderSentList();}
function actionButton(label,className,handler){const button=document.createElement('button');button.className=className;button.textContent=label;button.type='button';button.addEventListener('click',handler);return button;}
/* User-owned text is always inserted as text, never parsed as markup. */
function renderWordList(){const el=document.getElementById('wlist');document.getElementById('startBtn').disabled=ownedWords.length===0;el.replaceChildren();if(!ownedWords.length){const empty=document.createElement('div');empty.className='empty-msg';empty.textContent='단어를 추가하면 AI 이미지 연상법을 만들어줘요 ✨';el.append(empty);return;}ownedWords.forEach((word,index)=>{const row=document.createElement('div');row.className='wi';const en=document.createElement('span');en.className='wd';en.textContent=word.word;const ko=document.createElement('span');ko.className='mn';ko.textContent=word.meaning;row.append(en,ko);const item=currentItem('word',word.word,word.meaning),lapses=item?progressById[item.id]?.lapses:0;if(lapses){const badge=document.createElement('span');badge.className='err-badge';badge.textContent=`오답 ${lapses}회`;row.append(badge);}row.append(actionButton('수정','edit-btn',()=>editWord(index)),actionButton('×','del-btn',()=>delWord(index)));el.append(row);});}
function renderSentList(){const el=document.getElementById('slist');document.getElementById('startSentBtn').disabled=ownedSents.length===0;el.replaceChildren();if(!ownedSents.length){const empty=document.createElement('div');empty.className='empty-msg';empty.textContent='문장을 추가해 학습해요 ✨';el.append(empty);return;}ownedSents.forEach((sentence,index)=>{const row=document.createElement('div');row.className='wi swi';const texts=document.createElement('div');texts.className='swi-texts';const en=document.createElement('div');en.className='sent-en';en.textContent=sentence.en;const ko=document.createElement('div');ko.className='sent-ko';ko.textContent=sentence.ko;texts.append(en,ko);row.append(texts,actionButton('수정','edit-btn',()=>editSent(index)),actionButton('×','del-btn',()=>delSent(index)));el.append(row);});}
