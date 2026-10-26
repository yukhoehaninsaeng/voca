/* Small compatibility fixes for the mobile learning hub. No storage migrations. */
(function(){
  window.checkTeacherAnswer=function(){
    const input=document.getElementById('teacher-answer');
    const feedback=document.getElementById('teacher-feedback');
    if(!input||!feedback)return;
    const answer=input.value.trim();
    if(!answer){feedback.textContent='먼저 영어 문장을 입력해 주세요.';return;}
    const prompt=teacherPrompts[teacherPromptIndex];
    const normalize=value=>value.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').filter(Boolean).join(' ').trim();
    const exact=normalize(answer)===normalize(prompt.en);
    feedback.textContent=(exact?'예시 정답과 일치해요! ':'예시 정답과 비교해 보세요. ')+'정답 예시: '+prompt.en+' · 포인트: '+prompt.tip;
  };
  window.startReviewSession=function(){
    const plan=ensureTodayPlan();
    const completed=new Set(Object.values(dailySession?.results||{}).map(x=>x?.taskId).filter(Boolean));
    const steps=(plan.steps||[]).filter(step=>(step.taskType==='review'||String(step.reason||'').includes('복습'))&&!completed.has(step.taskId));
    if(!steps.length){renderReviewScreen();return;}
    const mode=steps[0].mode;
    const ids=new Set(steps.filter(step=>step.mode===mode).map(step=>step.itemId));
    const items=catalog.items.filter(item=>ids.has(item.id));
    if(!items.length){renderReviewScreen();return;}
    selection={...selection,sourceIds:catalog.sources.filter(source=>source.kind!=='virtual').map(source=>source.id),mode};
    selectedStudyItems=items;
    persistV2();
    if(['flash','type'].includes(mode)){
      words=items.map(item=>({word:item.en,meaning:item.ko,_itemId:item.id,_itemType:item.type}));
      errCount={};go(mode);return;
    }
    sents=items.map(item=>({en:item.en,ko:item.ko,_itemId:item.id}));
    sErrCount={};setSentModeAndGo(mode,'user');
  };
})();
