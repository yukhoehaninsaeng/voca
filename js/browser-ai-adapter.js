/* Compatibility adapter: existing free talk, feedback and mnemonic use browser-owned keys. */
(function(){
 const originalFetch=window.fetch.bind(window);
 window.fetch=function(input,init){
  const url=typeof input==='string'?input:input?.url;
  if((url==='/api/chat'||url==='/api/talk-feedback')&&init?.method?.toUpperCase()==='POST'&&window.VocaUser){
   let payload;try{payload=JSON.parse(init.body||'{}');}catch(e){return Promise.reject(e);}
   const task=url==='/api/chat'?'chat':'feedback';
   return window.VocaUser.ai(task,payload).then(data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})).catch(e=>new Response(JSON.stringify({error:e.message}),{status:503,headers:{'Content-Type':'application/json'}}));
  }
  return originalFetch(input,init);
 };
 // Replace previous server-key-only mnemonic implementation with BYOK.
 if(typeof getAI==='function'){
  getAI=async function(word,meaning){
   const current=window.VocaUser.active(),cacheKey=VocabCore.stableHash(word+'\n'+meaning+'\n'+current.provider+'\n'+current.model+'\nbyok-v1');
   if(aiCache[cacheKey])return aiCache[cacheKey];
   try{
    const result=await window.VocaUser.ai('mnemonic',{word,meaning});
    aiCache[cacheKey]=result;localStorage.setItem('vm-ai-cache-v2',JSON.stringify(aiCache));return result;
   }catch(e){return {scene:'',memory:'',sentence:'',error:e.message};}
  };
 }
 window.showApiModal=function(){go('profile');const field=document.getElementById('voca-provider');field?.scrollIntoView({behavior:'smooth',block:'center'});};
})();
