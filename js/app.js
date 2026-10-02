/* ─── PERSIST (localStorage) ────────────────────────── */
const LS={
  save(){
    try{
      localStorage.setItem('vm-words',JSON.stringify(words));
      localStorage.setItem('vm-sents',JSON.stringify(sents));
      localStorage.setItem('vm-errCount',JSON.stringify(errCount));
      localStorage.setItem('vm-sErrCount',JSON.stringify(sErrCount));
      localStorage.setItem('vm-selectedPart',selectedPart||'all');
      localStorage.setItem('vm-selectedCustom',selectedCustom||'');
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
  saveApiKey(k){try{localStorage.setItem('vm-apikey',k);}catch(e){}},
  loadApiKey(){try{return localStorage.getItem('vm-apikey')||'';}catch(e){return'';}},
};

/* ─── STATE ─────────────────────────────────────────── */
let API_KEY='';
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

/* ─── THEME ─────────────────────────────────────────── */
function toggleTheme(){document.body.classList.toggle('light');const l=document.body.classList.contains('light');localStorage.setItem('vm-theme',l?'light':'dark');document.querySelector('meta[name="theme-color"]').setAttribute('content',l?'#f5f5f8':'#0f0f13');}
(function(){const s=localStorage.getItem('vm-theme');if(s==='light'){document.body.classList.add('light');document.querySelector('meta[name="theme-color"]').setAttribute('content','#f5f5f8');}})();

/* ─── API ────────────────────────────────────────────── */
function saveApiKey(){
  const k=document.getElementById('apiKeyInput').value.trim();if(!k)return;
  API_KEY=k;LS.saveApiKey(k);
  document.getElementById('apiModal').style.display='none';
  const b=document.getElementById('apiStatus');b.textContent='AI ON';b.style.background='#1eca8b';
}
function skipApiKey(){document.getElementById('apiModal').style.display='none';}
function showApiModal(){document.getElementById('apiModal').style.display='flex';}

// 저장된 API 키 복원 + 모달 조건 처리
(function(){
  const saved=LS.loadApiKey();
  if(saved){
    API_KEY=saved;
    document.getElementById('apiModal').style.display='none';
    document.getElementById('apiKeyInput').value=saved;
    const b=document.getElementById('apiStatus');b.textContent='AI ON';b.style.background='#1eca8b';
  }
  // API 키 없어도 모달 안 띄움 — 사용자가 필요할 때 버튼으로 열 수 있음
  document.getElementById('apiModal').style.display='none';
})();

/* ─── CANVAS ─────────────────────────────────────────── */
const PAL=[['#1a2a4a','#0d1f3c','#5b9df9'],['#0d2e22','#0a2019','#1eca8b'],['#2e1f0a','#231600','#f5a623'],['#2a0d22','#1f0a18','#e86daa'],['#1a0d3a','#130929','#9b7cf8'],['#0d2a1a','#091f12','#4ec98a']];
function palette(i){return PAL[i%PAL.length];}
function drawScene(canvas,word,meaning,pal){const ctx=canvas.getContext('2d');const W=canvas.width=canvas.offsetWidth||340;const H=canvas.height=canvas.offsetHeight||120;ctx.clearRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,pal[0]);g.addColorStop(1,pal[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);const seed=word.charCodeAt(0)*31+word.length;for(let i=0;i<7;i++){const x=((seed*(i+1)*137)%W);const y=((seed*(i+2)*79)%H);const r=20+((seed*(i+3)*53)%45);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=pal[2]+(i%2===0?'20':'10');ctx.fill();}ctx.font=`900 ${Math.min(W,H)*.55}px Nunito,sans-serif`;ctx.fillStyle=pal[2]+'18';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(word[0].toUpperCase(),W*.8,H*.5);}

/* ─── AI ─────────────────────────────────────────────── */
async function getAI(word,meaning){if(aiCache[word])return aiCache[word];if(!API_KEY)return{scene:'',memory:'',sentence:''};try{const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':API_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:400,messages:[{role:'user',content:`영어 단어 "${word}" (뜻: ${meaning})에 대해 JSON만 응답:{"scene":"시각적 장면 1-2문장","memory":"한국인 연상법 1문장","sentence":"예문 | 한국어"}`}]})});const d=await res.json();const txt=d.content?.find(c=>c.type==='text')?.text||'{}';const p=JSON.parse(txt.replace(/```json|```/g,'').trim());aiCache[word]=p;return p;}catch(e){return{scene:'',memory:'',sentence:''};}}

/* ─── WORD LIST ──────────────────────────────────────── */
function renderWordList(){const el=document.getElementById('wlist');document.getElementById('startBtn').disabled=words.length===0;if(!words.length){el.innerHTML='<div class="empty-msg">단어를 추가하면<br>AI 이미지 연상법을 만들어줘요 ✨</div>';return;}el.innerHTML=words.map((w,i)=>{const ec=errCount[i]||0;return`<div class="wi"><span class="wd">${w.word}</span><span class="mn">${w.meaning}</span>${ec>0?`<span class="err-badge">오답 ${ec}회</span>`:''}<button class="del-btn" onclick="delWord(${i})">×</button></div>`;}).join('');}
function addWord(){const wi=document.getElementById('wi'),mi=document.getElementById('mi');const w=wi.value.trim(),m=mi.value.trim();if(!w||!m)return;words.push({word:w,meaning:m});wi.value='';mi.value='';renderWordList();wi.focus();LS.save();}
function delWord(i){words.splice(i,1);delete errCount[i];renderWordList();LS.save();}
document.getElementById('mi').addEventListener('keydown',e=>{if(e.key==='Enter')addWord();});
document.getElementById('wi').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('mi').focus();});

/* ─── SENT LIST ──────────────────────────────────────── */
function renderSentList(){const el=document.getElementById('slist');document.getElementById('startSentBtn').disabled=sents.length===0;if(!sents.length){el.innerHTML='<div class="empty-msg">문장을 추가해 학습해요 ✨</div>';return;}el.innerHTML=sents.map((s,i)=>{const ec=sErrCount[i]||0;return`<div class="wi swi"><div class="swi-row"><div class="swi-texts"><div class="sent-en">${s.en}</div><div class="sent-ko">${s.ko}</div></div>${ec>0?`<span class="err-badge">오답 ${ec}회</span>`:''}<button class="del-btn" onclick="delSent(${i})">×</button></div></div>`;}).join('');}
function addSent(){const ei=document.getElementById('si-en'),ki=document.getElementById('si-ko');const e=ei.value.trim(),k=ki.value.trim();if(!e||!k)return;sents.push({en:e,ko:k});ei.value='';ki.value='';renderSentList();ei.focus();LS.save();}
function delSent(i){sents.splice(i,1);delete sErrCount[i];renderSentList();LS.save();}
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
  document.querySelectorAll('.bnav-btn').forEach((b,i)=>b.classList.toggle('active',['input','learn'][i]===tab));
  document.querySelectorAll('.tnav-btn').forEach((b,i)=>b.classList.toggle('active',['input','learn'][i]===tab));
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  document.getElementById('s-'+tab).classList.add('on');
  window.scrollTo({top:0,behavior:'smooth'});
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
function repeatCount(){return Object.values(errCount).filter(v=>v>0).length;}

/* 틀린 단어 2회 이상 → 커스텀카드 매번틀린단어에 자동 등록 */
function trackWrongWord(word,meaning){
  if(!word)return;
  const key='__w__'+word.toLowerCase();
  errCount[key]=(errCount[key]||0)+1;
  if(errCount[key]>=2){
    const mc=CUSTOM_CARDS.find(c=>c.id==='mistake');
    if(mc&&!mc.items.some(it=>it.correct.toLowerCase()===word.toLowerCase())){
      mc.items.push({wrong:'?',correct:word,note:meaning||'반복 오답'});
    }
  }
  LS.save();
}

function renderLearnScreen(){
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
  document.getElementById('flash-body').innerHTML=`<div class="mem-card" id="fcard" onclick="flipFlash(${wi})"><div class="mem-scene"><canvas id="fcanvas"></canvas></div><div class="mem-body">${isR?'<div class="ai-label repeat-lbl" style="margin-bottom:.5rem">🔁 복습 중</div>':''}<div class="mem-word" id="fword" style="filter:blur(6px)">${w.word}</div><div class="mem-meaning">${w.meaning}</div><div class="mem-reveal" id="freveal"><div id="fai-content"><div class="ai-loading">AI 연상법 생성 중</div></div></div><div class="tap-hint" id="ftap">탭하여 단어 확인 👆</div></div></div><div class="fc-btns"><button class="fc-btn dunno" onclick="markFlash(${wi},false)">😅 모르겠어요</button><button class="fc-btn know" onclick="markFlash(${wi},true)">✅ 알아요!</button></div><div class="ctr-line">${fIdx+1} / ${fQueue.length}</div>`;
  setTimeout(()=>{const c=document.getElementById('fcanvas');if(c)drawScene(c,w.word,w.meaning,pal);},50);getAI(w.word,w.meaning);
}
function reviewFlash(){
  const wrongIdxs=Object.entries(errCount).filter(([k,v])=>!k.startsWith('__w__')&&v>0).map(([k])=>parseInt(k)).filter(i=>!isNaN(i)&&i<words.length);
  if(!wrongIdxs.length)return;
  fQueue=wrongIdxs.sort(()=>Math.random()-.5);fIdx=0;fKnow=0;fDunno=0;
  repeatBanner('f-rq-banner','f-repeat',errCount);updateFStats();showFlash();
}
async function flipFlash(wi){if(fFlipped)return;fFlipped=true;const w=words[wi];document.getElementById('fword').style.filter='none';document.getElementById('freveal').classList.add('on');document.getElementById('ftap').style.display='none';const ai=await getAI(w.word,w.meaning);const el=document.getElementById('fai-content');if(!el)return;let h='';if(ai.scene)h+=`<div class="ai-section"><div class="ai-label mem-lbl">🖼 이미지 연상</div><div class="ai-text">${ai.scene}</div></div>`;if(ai.memory)h+=`<div class="ai-section"><div class="ai-label mem-lbl2">💡 기억법</div><div class="ai-text">${ai.memory}</div></div>`;if(ai.sentence){const p=ai.sentence.split('|');h+=`<div class="ai-section"><div class="ai-label ex-lbl">📖 예문</div><div class="ai-text"><em>${p[0]?.trim()||''}</em>${p[1]?'<br>'+p[1].trim():''}</div></div>`;}el.innerHTML=h||'<div style="font-size:.73rem;color:var(--text3);text-align:center;padding:.5rem">API 키를 설정하면 AI 연상법이 표시돼요</div>';}
function markFlash(wi,know){if(know){fKnow++;if(errCount[wi]>0)errCount[wi]=Math.max(0,errCount[wi]-1);}else{fDunno++;errCount[wi]=(errCount[wi]||0)+1;}fIdx++;const fc=document.getElementById('fcard');if(fc){fc.classList.add('pop');setTimeout(()=>fc.classList.remove('pop'),250);}updateFStats();repeatBanner('f-rq-banner','f-repeat',errCount);renderWordList();LS.save();showFlash();}

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
  document.getElementById('quiz-body').innerHTML=`<div class="qword-card">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="qword">${correct.word}</div><div class="qsub">알맞은 뜻을 고르세요</div></div><div class="qopts">${opts.map(o=>`<button class="qopt" data-meaning="${o.meaning.replace(/"/g,'&quot;')}" onclick="answerQuiz(this,'${o.meaning.replace(/'/g,"\\'")}','${correct.meaning.replace(/'/g,"\\'")}',${wi})">${o.meaning}</button>`).join('')}</div><div class="feedback-box" id="qfb"></div><button class="btn btn-wide" id="qnext" style="display:none;margin-top:.25rem" onclick="nextQuiz()">다음 문제 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
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
  const ok=chosen===correct;
  if(ok){qOk++;if(errCount[wi]>0)errCount[wi]=Math.max(0,errCount[wi]-1);}
  else{btn.classList.add('wrong');qNg++;errCount[wi]=(errCount[wi]||0)+1;trackWrongWord(words[wi]?.word,words[wi]?.meaning);}
  updateQStats();repeatBanner('q-rq-banner','q-repeat',errCount);renderWordList();LS.save();
  const fb=document.getElementById('qfb');fb.className='feedback-box '+(ok?'ok':'ng');fb.style.display='block';
  const w=words[wi],pal=palette(wi);
  fb.innerHTML=`<div class="fb-top ${ok?'ok':'ng'}">${ok?'🎉 정답이에요!':`❌ 틀렸어요. 정답: <strong>${correct}</strong>`}</div><div class="fb-scene"><canvas id="qfbcanvas"></canvas></div><div id="qfbai"><div class="ai-loading">AI 연상법 로딩 중</div></div>`;
  setTimeout(()=>{const c=document.getElementById('qfbcanvas');if(c)drawScene(c,w.word,w.meaning,pal);},30);
  const ai=await getAI(w.word,w.meaning);const el=document.getElementById('qfbai');if(!el)return;
  let h='';if(ai.scene)h+=`<div class="ai-label mem-lbl" style="margin-bottom:.3rem">🖼 연상 장면</div><div class="ai-text" style="margin-bottom:.5rem">${ai.scene}</div>`;if(ai.memory)h+=`<div class="ai-label mem-lbl2" style="margin-bottom:.3rem">💡 기억법</div><div class="ai-text">${ai.memory}</div>`;el.innerHTML=h||'';
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
  document.getElementById('type-body').innerHTML=`<div class="tword-card" id="tcard">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="tmeaning">${w.meaning}</div><div class="hint-boxes" id="hboxes">${w.word.split('').map((ch,i)=>`<div class="hbox${i===0?' ok2':''}" id="hb${i}">${i===0?ch.toUpperCase():' '}</div>`).join('')}</div></div><div class="tinput-row" id="tinput-row"><input class="tinput" id="tinput" type="text" placeholder="영어로 입력..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/><button class="btn" id="tchk" onclick="checkType(${wi})">확인</button></div><div class="feedback-box" id="tfb"></div><div id="tai-out"></div><button class="btn btn-wide" id="tnext" style="display:none;margin-top:.25rem" onclick="nextType()">다음 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
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
  const w=words[wi],ok=val.toLowerCase()===w.word.toLowerCase();
  inp.classList.add(ok?'tok':'tng');
  w.word.split('').forEach((ch,i)=>{const hb=document.getElementById('hb'+i);if(hb){hb.textContent=ch;hb.className='hbox '+(ok?'ok2':'ng2');}});
  if(ok){tOk++;if(errCount[wi]>0)errCount[wi]=Math.max(0,errCount[wi]-1);}
  else{tNg++;errCount[wi]=(errCount[wi]||0)+1;trackWrongWord(w.word,w.meaning);const tc=document.getElementById('tcard');if(tc){tc.classList.add('shake');setTimeout(()=>tc.classList.remove('shake'),300);}}
  updateTStats();repeatBanner('t-rq-banner','t-repeat',errCount);renderWordList();LS.save();
  const fb=document.getElementById('tfb');fb.className='feedback-box '+(ok?'ok':'ng');fb.style.display='block';
  const pal=palette(wi);
  fb.innerHTML=`<div class="fb-top ${ok?'ok':'ng'}">${ok?'🎉 정답이에요!':`❌ 틀렸어요. 정답: <strong>${w.word}</strong> (${w.meaning})`}</div><div class="fb-scene"><canvas id="tfbcanvas"></canvas></div><div id="tfbai"><div class="ai-loading">AI 연상법 로딩 중</div></div>`;
  setTimeout(()=>{const c=document.getElementById('tfbcanvas');if(c)drawScene(c,w.word,w.meaning,pal);},30);
  const ai=await getAI(w.word,w.meaning);const el=document.getElementById('tfbai');if(!el)return;
  let h='';if(ai.scene)h+=`<div class="ai-label mem-lbl" style="margin-bottom:.3rem">🖼 연상 장면</div><div class="ai-text" style="margin-bottom:.5rem">${ai.scene}</div>`;if(ai.memory)h+=`<div class="ai-label mem-lbl2" style="margin-bottom:.3rem">💡 기억법</div><div class="ai-text">${ai.memory}</div>`;el.innerHTML=h||'';
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
    return part;
  });
  if(!replaced){
    const nonSpace=dispParts.filter(p=>!/^\s+$/.test(p));
    if(nonSpace.length){const last=nonSpace[nonSpace.length-1];const lastIdx=dispParts.lastIndexOf(last);dispParts[lastIdx]='<span class="blank-word">_____</span>';}
  }
  const disp=dispParts.join('');
  document.getElementById(bodyId).innerHTML=`<div class="sent-card" id="${prefix}card">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="sent-mode-label">빈칸 채우기</div><div class="sent-ko-display">${s.ko}</div><div class="blank-sentence">${disp}</div></div><div class="blank-input-wrap" id="${prefix}binp-row"><input class="blank-input" id="${prefix}binp" type="text" placeholder="빈칸에 들어갈 단어" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-blank="${blank.replace(/"/g,'&quot;')}" data-si="${si}" data-prefix="${prefix}"/><button class="btn" id="${prefix}bchk" onclick="checkBlank('${prefix}')">확인</button></div><div class="feedback-box" id="${prefix}fb"></div><button class="btn btn-wide" id="${prefix}next" style="display:none;margin-top:.25rem" onclick="next_${prefix}()">다음 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
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
  const ok=normalize(val)===normalize(blank);
  const isUser=(prefix==='s');
  if(isUser){
    if(ok){sOk++;if(sErrCount[si]>0)sErrCount[si]=Math.max(0,sErrCount[si]-1);}
    else{sNg++;sErrCount[si]=(sErrCount[si]||0)+1;trackWrongWord(blank,null);}
    updateSStats();renderSentList();LS.save();
  }else{
    if(ok){tsOk++;if(toeicErrCount[si]>0)toeicErrCount[si]=Math.max(0,toeicErrCount[si]-1);}
    else{tsNg++;toeicErrCount[si]=(toeicErrCount[si]||0)+1;trackWrongWord(blank,null);}
    updateTsStats();
  }
  const src=isUser?sents[si]:getToeicSents()[si];
  const fb=document.getElementById(prefix+'fb');fb.style.display='block';fb.className='feedback-box '+(ok?'ok':'ng');
  // 틀린 경우: 정답 단어 뜻도 표시 (단어장에서 찾기)
  let blankMeaning='';
  if(!ok){
    const found=words.find(w=>w.word.toLowerCase()===blank.toLowerCase());
    if(found)blankMeaning=` (뜻: ${found.meaning})`;
  }
  fb.innerHTML=`<div class="fb-top ${ok?'ok':'ng'}">${ok?'🎉 정답이에요!':`❌ 정답: <strong>${blank}</strong>${blankMeaning}`}</div><div style="font-size:.78rem;color:var(--text2);font-weight:600;line-height:1.7;margin-top:.4rem">${src.en}<br><span style="color:var(--text3)">${src.ko}</span></div>`;
  document.getElementById(prefix+'next').style.display='block';
}
function showSentFull(si,s,isR,bodyId,prefix){
  document.getElementById(bodyId).innerHTML=`<div class="sent-card" id="${prefix}card">${isR?'<div class="repeat-tag">🔁 복습</div>':''}<div class="sent-mode-label">전체 받아쓰기</div><div class="sent-ko-display">${s.ko}</div></div><div id="${prefix}full-input-wrap"><textarea class="full-sent-textarea" id="${prefix}finp" placeholder="영어 문장 전체 입력... (Ctrl+Enter로 채점)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea><button class="btn primary btn-wide" id="${prefix}fchk" onclick="checkFull('${prefix}',${si})" style="margin-bottom:.75rem">채점하기</button></div><div class="feedback-box" id="${prefix}fb"></div><button class="btn btn-wide" id="${prefix}next" style="display:none;margin-top:.25rem" onclick="next_${prefix}()">다음 → <span style="font-size:.65rem;opacity:.55">Enter</span></button>`;
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
  const ok=normalize(val)===normalize(src.en);ta.classList.add(ok?'tok':'tng');
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
      if(c===cc)return`<span class="diff-ok">${w}</span>`;
      trackWrongWord(cWords[i],null);
      const found=words.find(wd=>wd.word.toLowerCase()===cc);
      const tip=found?` <span style="font-size:.62rem;color:var(--amber)">(${found.meaning})</span>`:'';
      return`<span class="diff-ng">${w}</span>${tip}`;
    }).join(' ');
    fb.innerHTML=`<div class="fb-top ng">❌ 틀렸어요.</div><div style="font-size:.72rem;color:var(--text3);margin-bottom:.35rem;font-weight:700">내가 쓴 답 (빨간=틀림, 노란=뜻)</div><div class="diff-result">${diffHtml}</div><div style="font-size:.72rem;color:var(--text3);margin:.5rem 0 .3rem;font-weight:700">정답</div><div style="font-size:.82rem;font-weight:700;color:var(--green);line-height:1.7">${src.en}</div>`;
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
      <div class="voice-ko">${s.ko}</div>
      <div style="font-size:.7rem;color:var(--text3);font-weight:700;margin-bottom:.5rem">위 한국어를 영어로 말해보세요</div>

      <!-- 힌트: 정답 문장 보기/가리기 -->
      <div style="margin-bottom:1rem">
        <button class="shadow-btn" id="hintBtn" onclick="toggleHint()" style="font-size:.72rem;padding:6px 14px;">
          💡 정답 힌트 보기
        </button>
        <div id="hintBox" style="display:none;margin-top:.5rem;padding:.625rem .875rem;background:var(--amber-bg);border:1px solid rgba(245,166,35,.25);border-radius:var(--r-sm);font-size:.82rem;font-weight:700;color:var(--amber);line-height:1.6;word-break:break-word;">
          ${s.en}
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
      <button class="shadow-btn" id="shadowBtn" onclick="playShadow('${s.en.replace(/'/g,"\\'")}')">
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

  let result={correct:false,reason:'채점 실패'};
  if(API_KEY){
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':API_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:150,
          messages:[{role:'user',content:`You are a lenient English speaking coach scoring a Korean learner.
Correct sentence: "${s.en}"
Student said: "${userAnswer}"

Grading rules (be generous — this is speech-to-text, not writing):
- CORRECT if the student conveyed the right meaning with mostly right words
- CORRECT if only articles (a/an/the) differ
- CORRECT if minor STT errors like "carring"→"carrying", "indor"→"indoors"
- CORRECT if word order is slightly off but meaning is clear
- WRONG only if key content words are missing or clearly wrong
- Focus feedback on the most important mistake only (1 sentence max, Korean preferred)
- Do NOT repeat the full correct sentence

Output JSON only (no markdown):
{"correct":true/false,"reason":"한국어로 핵심 피드백 한 줄"}`}]
        })
      });
      const d=await res.json();
      const txt=d.content?.find(c=>c.type==='text')?.text||'{}';
      result=JSON.parse(txt.replace(/```json|```/g,'').trim());
    }catch(e){
      const norm=t=>t.toLowerCase().replace(/[.,!?'"]/g,'').replace(/\s+/g,' ').trim();
      result={correct:norm(userAnswer)===norm(s.en),reason:'API 오류 — 단순 비교로 채점했어요.'};
    }
  } else {
    // API 없을 때 — 단어 수준 유사도로 느슨하게 채점
    const norm=t=>t.toLowerCase().replace(/[.,!?'"]/g,'').replace(/\s+/g,' ').trim();
    const uWords=norm(userAnswer).split(' ');
    const cWords=norm(s.en).split(' ');
    const matches=uWords.filter(w=>cWords.includes(w)).length;
    const similarity=matches/Math.max(cWords.length,1);
    const ok=similarity>=0.75; // 75% 이상 단어 일치 시 정답
    result={correct:ok,reason:ok?'정답이에요! (유사도 기반)':`핵심 단어가 부족해요. API 키를 설정하면 상세 피드백이 제공돼요.`};
  }

  const ok=result.correct;
  if(ok){vOk++;}else{vNg++;}
  updateVStats();

  // 단어별 diff 하이라이트 (정답 단어 뜻도 표시)
  const userWords=userAnswer.trim().split(/\s+/);
  const correctWords=s.en.replace(/[.,!?'"]/g,'').split(/\s+/);
  const highlighted=userWords.map((w,i)=>{
    const clean=w.replace(/[.,!?'"]/g,'').toLowerCase();
    const cClean=(correctWords[i]||'').toLowerCase();
    return clean===cClean
      ?`<span class="stt-word-ok">${w}</span>`
      :`<span class="stt-word-ng">${w}</span>`;
  }).join(' ');
  if(sttRes){sttRes.innerHTML=highlighted;sttRes.classList.add('has-text');}

  fb.className=`voice-feedback ${ok?'ok':'ng'}`;
  const speedBadge=`<span class="speed-badge">⏱ ${elapsed}초</span>`;
  fb.innerHTML=`
    <div class="vf-top ${ok?'ok':'ng'}">${ok?`🎉 정답이에요! ${speedBadge}`:`❌ 틀렸어요 ${speedBadge}`}</div>
    <div class="vf-reason">${result.reason}</div>
    ${!ok?`<div class="vf-correct">✅ 정답: ${s.en}</div>`:''}
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
    }
  }catch(e){}
})();
