/* Secure provider settings. Legacy browser keys are not used for new requests. */
(function(){
  const $=id=>document.getElementById(id);
  function render(){
    const modal=$('apiModal');if(!modal)return;
    const label=modal.querySelector('h2');if(label)label.textContent='AI 연결 설정 (OpenAI / Anthropic)';
    const p=modal.querySelector('p');if(p)p.textContent='API 키는 Vercel 서버 환경 변수에 등록합니다. 브라우저에 키를 저장하지 않습니다. OpenAI 또는 Anthropic 중 하나를 선택해 연상법을 생성하고, OpenAI는 프리토킹에도 사용할 수 있습니다.';
    const key=$('apiKeyInput');if(key){key.value='';key.placeholder='Vercel 환경 변수에서 설정';key.disabled=true;}
    const model=$('apiModelInput');if(model){model.value='서버 환경 변수에서 설정';model.disabled=true;}
    if(!$('provider-help')){
      const box=document.createElement('div');box.id='provider-help';box.className='hub-ai-disclaimer';
      box.textContent='OpenAI: AI_PROVIDER=openai, OPENAI_API_KEY 설정. Anthropic: AI_PROVIDER=anthropic, ANTHROPIC_API_KEY 설정. 프리토킹은 OPENAI_API_KEY를 사용합니다. 환경 변수 변경 후 Vercel 재배포가 필요합니다.';
      model?.closest('label')?.after(box);
    }
    const actions=modal.querySelector('.modal-actions');
    const save=actions?.querySelector('button:first-child');if(save){save.textContent='연결 확인';save.onclick=checkConnection;}
    const clear=actions?.querySelector('button:nth-child(2)');if(clear){clear.textContent='기존 브라우저 키 삭제';clear.onclick=clearLegacy;}
  }
  async function checkConnection(){
    const msg=$('apiMessage');if(msg)msg.textContent='서버 설정을 확인하고 있어요...';
    try{
      const res=await fetch('/api/ai-status',{cache:'no-store'});const data=await res.json();
      if(msg)msg.textContent=data.configured?'연상법 AI 연결 준비됨 ('+data.provider+'). 프리토킹: '+(data.freeTalk?'OpenAI 연결 준비됨':'OpenAI 키 미설정'):'서버 API 키가 아직 설정되지 않았어요.';
      const badge=$('apiStatus');if(badge){badge.textContent=data.configured?'AI ON':'AI OFF';badge.classList.toggle('connected',Boolean(data.configured));}
    }catch(e){if(msg)msg.textContent='서버 설정을 확인하지 못했습니다.';}
  }
  function clearLegacy(){
    localStorage.removeItem('vm-apikey');localStorage.removeItem('vm-ai-model');
    if(typeof API_KEY!=='undefined')API_KEY='';
    if($('apiMessage'))$('apiMessage').textContent='이 브라우저에 저장된 이전 Anthropic 키를 삭제했습니다.';
  }
  window.showApiModal=function(){render();$('apiModal').style.display='flex';checkConnection();};
  window.saveApiKey=checkConnection;
  window.clearApiKey=clearLegacy;
  getAI=async function(word,meaning){
    const cacheKey=VocabCore.stableHash(word+'\n'+meaning+'\nserver-v1');
    if(aiCache[cacheKey])return aiCache[cacheKey];
    try{
      const res=await fetch('/api/mnemonic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word,meaning})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'AI 서버 설정을 확인해 주세요.');
      if(!['scene','memory','sentence'].every(key=>typeof data[key]==='string'))throw new Error('응답 형식 오류');
      aiCache[cacheKey]=data;localStorage.setItem('vm-ai-cache-v2',JSON.stringify(aiCache));return data;
    }catch(error){return{scene:'',memory:'',sentence:'',error:error.message||'AI 연결 실패'};}
  };
  window.addEventListener('DOMContentLoaded',()=>{render();checkConnection();});
})();
