// Analyze a completed English conversation. Server-side key only.
module.exports=async function(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI_NOT_CONFIGURED'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const messages=Array.isArray(body.history)?body.history.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').slice(-24).map(x=>({role:x.role,content:x.content.slice(0,600)})):[];
  const userTurns=messages.filter(x=>x.role==='user');
  if(!userTurns.length)return res.status(400).json({error:'NO_USER_TURNS'});
  const prompt='You are a Korean-speaking TOEIC Speaking coach. Analyze ONLY actual English utterances from the user. Do not invent mistakes. Return a strict JSON object with keys summary (Korean, 1-2 sentences), strengths (array of up to 2 short Korean strings), corrections (array of up to 5 objects {original,corrected,reason} where original must be a verbatim substring from the user, corrected is natural English, reason is Korean), nextPractice (array of up to 3 objects {en,ko} using corrected example sentences). If no grammar issues, corrections and nextPractice may be empty. No markdown. Do not claim to evaluate pronunciation or fluency from text.';
  const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_CHAT_MODEL||'gpt-4o-mini',messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(messages)}],response_format:{type:'json_object'},max_tokens:850})});
  if(!upstream.ok)return res.status(502).json({error:'AI_UPSTREAM_ERROR'});
  const result=await upstream.json();const raw=result?.choices?.[0]?.message?.content;if(!raw)return res.status(502).json({error:'EMPTY_REPLY'});
  const data=JSON.parse(raw);
  const str=x=>String(x||'').slice(0,450);
  const corrections=Array.isArray(data.corrections)?data.corrections.filter(x=>x&&typeof x.original==='string'&&userTurns.some(t=>t.content.includes(x.original))).slice(0,5).map(x=>({original:str(x.original),corrected:str(x.corrected),reason:str(x.reason)})):[];
  const nextPractice=Array.isArray(data.nextPractice)?data.nextPractice.slice(0,3).map(x=>({en:str(x.en),ko:str(x.ko)})).filter(x=>x.en&&x.ko):[];
  res.setHeader('Cache-Control','no-store');return res.status(200).json({summary:str(data.summary),strengths:Array.isArray(data.strengths)?data.strengths.slice(0,2).map(str):[],corrections,nextPractice});
 }catch(e){return res.status(500).json({error:'FEEDBACK_FAILED'});}
};