/* Browser-owned AI settings and portable encrypted backup. */
(function(){
 const KEY='vm-byok-settings-v1',LEGACY='vm-apikey',FORMAT='voca_user_info',PREFIX='vm-';
 const $=id=>document.getElementById(id);
 const encoder=new TextEncoder(),decoder=new TextDecoder();
 const b64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
 const unb64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
 const readSettings=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(e){return {};}};
 function settings(){
  const saved=readSettings();
  return {provider:saved.provider==='anthropic'?'anthropic':'openai',openai:saved.openai||'',anthropic:saved.anthropic||'',openaiModel:saved.openaiModel||'gpt-4o-mini',anthropicModel:saved.anthropicModel||'claude-haiku-4-5-20251001'};
 }
 function saveSettings(value){localStorage.setItem(KEY,JSON.stringify(value));window.dispatchEvent(new Event('voca-ai-settings-changed'));}
 function active(){const s=settings();return {provider:s.provider,key:s[s.provider],model:s[s.provider+'Model']};}
 async function ai(task,payload={}){
  const s=active();if(!s.key)throw Error('브라우저 AI 설정에서 '+s.provider+' API 키를 등록해 주세요.');
  const response=await fetch('/api/user-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,provider:s.provider,key:s.key,model:s.model,...payload})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error('AI 호출 실패 ('+(data.status||data.error||response.status)+')');
  return data;
 }
 window.VocaUser={ai,settings,active};
 function status(message){const el=$('voca-data-status');if(el)el.textContent=message;}
 function init(){
  const s=settings(),provider=$('voca-provider');if(!provider)return;
  provider.value=s.provider;$('voca-openai-key').value=s.openai;$('voca-anthropic-key').value=s.anthropic;
  $('voca-openai-model').value=s.openaiModel;$('voca-anthropic-model').value=s.anthropicModel;
  provider.addEventListener('change',()=>{$('voca-provider-hint').textContent=provider.value==='openai'?'OpenAI를 모든 AI 학습 기능에 사용합니다.':'Anthropic을 모든 AI 학습 기능에 사용합니다.';});
  provider.dispatchEvent(new Event('change'));
  $('voca-save-ai').addEventListener('click',()=>{
   saveSettings({provider:provider.value,openai:$('voca-openai-key').value.trim(),anthropic:$('voca-anthropic-key').value.trim(),openaiModel:$('voca-openai-model').value.trim()||'gpt-4o-mini',anthropicModel:$('voca-anthropic-model').value.trim()||'claude-haiku-4-5-20251001'});
   status('AI 설정 저장 완료. 실제 연결은 AI 연결 테스트를 눌러 확인해 주세요.');
  });
  $('voca-clear-ai').addEventListener('click',()=>{if(!confirm('이 브라우저의 API 키를 삭제할까요?'))return;localStorage.removeItem(KEY);localStorage.removeItem(LEGACY);$('voca-openai-key').value='';$('voca-anthropic-key').value='';window.dispatchEvent(new Event('voca-ai-settings-changed'));status('저장된 API 키를 삭제했어요.');});
  $('voca-export').addEventListener('click',exportBackup);
  $('voca-import').addEventListener('change',importBackup);
  $('voca-backup-folder').addEventListener('click',connectFolder);
  const legacy=localStorage.getItem(LEGACY);if(legacy&&!s.anthropic)status('이전 Anthropic 키가 감지되었어요. 새 설정으로 저장하면 백업에 포함할 수 있어요.');
 }
 function allData(){
  const data={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PREFIX)&&!k.startsWith('vm-backup-v1-'))data[k]=localStorage.getItem(k);}
  return data;
 }
 async function keyFromPassword(password,salt){
  const raw=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function encodeBackup(password){
  const data=allData(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const payload={format:FORMAT,version:1,exportedAt:new Date().toISOString(),origin:location.origin,storage:data};
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFromPassword(password,salt),encoder.encode(JSON.stringify(payload)));
  return JSON.stringify({format:FORMAT,version:1,encrypted:true,kdf:'PBKDF2-SHA256',iterations:210000,salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(encrypted))},null,2);
 }
 async function decodeBackup(raw,password){
  if(raw.length>15*1024*1024)throw Error('백업 파일이 너무 커요 (최대 15MB).');
  const envelope=JSON.parse(raw);
  if(envelope.format!==FORMAT||envelope.version!==1||!envelope.encrypted)throw Error('지원하지 않는 백업 형식입니다.');
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},await keyFromPassword(password,unb64(envelope.salt)),unb64(envelope.data));
  const payload=JSON.parse(decoder.decode(bytes));if(payload.format!==FORMAT||!payload.storage||typeof payload.storage!=='object')throw Error('백업 내용이 올바르지 않습니다.');
  const entries=Object.entries(payload.storage);if(entries.length>1000||entries.some(([k,v])=>!k.startsWith(PREFIX)||typeof v!=='string'||k.length>160))throw Error('허용되지 않는 저장 항목이 있습니다.');
  return payload;
 }
 function download(text){
  const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='voca_user_info.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 async function exportBackup(){
  const password=$('voca-backup-password').value;
  if(password.length<10){status('백업 암호는 10자 이상으로 설정해 주세요. 새 기기에서 복원할 때 필요합니다.');return;}
  try{const raw=await encodeBackup(password);download(raw);status('voca_user_info.json 파일을 다운로드했어요. 암호를 잊으면 복원할 수 없습니다.');}catch(e){status('백업 실패: '+e.message);}
 }
 async function importBackup(event){
  const file=event.target.files?.[0],password=$('voca-backup-password').value;event.target.value='';
  if(!file)return;if(!password){status('복원하려면 백업할 때 사용한 암호를 입력해 주세요.');return;}
  try{
   const payload=await decodeBackup(await file.text(),password);
   const count=Object.keys(payload.storage).length;
   if(!confirm('백업 항목 '+count+'개를 현재 기기의 데이터에 덮어쓰고 앱을 다시 열까요? 기존 데이터는 먼저 별도로 백업하는 것이 안전합니다.'))return;
   const previous=allData();
   try{for(const [key,value] of Object.entries(payload.storage))localStorage.setItem(key,value);}
   catch(e){for(const key of Object.keys(payload.storage)){if(!(key in previous))localStorage.removeItem(key);}for(const [key,value] of Object.entries(previous))localStorage.setItem(key,value);throw e;}
   window.dispatchEvent(new Event('voca-ai-settings-changed'));status('복원 완료. 앱을 새로고침합니다.');location.reload();
  }catch(e){status('복원 실패: 암호 또는 파일 형식을 확인해 주세요. '+e.message);}
 }
 async function connectFolder(){
  if(typeof window.showDirectoryPicker!=='function'){status('이 브라우저에서는 폴더 직접 저장을 지원하지 않습니다. 파일 다운로드를 이용해 주세요.');return;}
  const password=$('voca-backup-password').value;if(password.length<10){status('먼저 10자 이상의 백업 암호를 입력해 주세요.');return;}
  try{
   const root=await window.showDirectoryPicker({mode:'readwrite'});const folder=await root.getDirectoryHandle('voca앱',{create:true});
   const file=await folder.getFileHandle('voca_user_info.json',{create:true});const writer=await file.createWritable();
   await writer.write(await encodeBackup(password));await writer.close();
   status('선택한 폴더의 voca앱/voca_user_info.json에 저장했어요. 자동 동기화는 아니며, 최신 기록은 다시 저장해야 합니다.');
  }catch(e){status('폴더 저장을 완료하지 못했습니다: '+e.message);}
 }
 window.addEventListener('DOMContentLoaded',init);
})();