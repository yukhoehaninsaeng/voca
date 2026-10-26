// Configure AI_PROVIDER and matching API key in Vercel Environment Variables.
module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const {word,meaning}=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(typeof word!=='string'||typeof meaning!=='string'||!word.trim()||word.length>100||meaning.length>200)return res.status(400).json({error:'Invalid input'});
    const provider=(process.env.AI_PROVIDER||'openai').toLowerCase();
    const prompt='한국인 영어 학습자가 '+JSON.stringify(word)+' ('+meaning+')를 기억하도록 도와주세요. 반드시 JSON 객체만 응답하세요: {"scene":"짧은 장면","memory":"자연스러운 기억 단서","sentence":"쉬운 영어 예문 | 한국어 뜻"}';
    let url,headers,body;
    if(provider==='anthropic'){
      if(!process.env.ANTHROPIC_API_KEY)return res.status(503).json({error:'ANTHROPIC_API_KEY not configured'});
      url='https://api.anthropic.com/v1/messages';
      headers={'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'};
      body={model:process.env.ANTHROPIC_MODEL||'claude-haiku-4-5-20251001',max_tokens:450,messages:[{role:'user',content:prompt}]};
    }else if(provider==='openai'){
      if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY not configured'});
      url='https://api.openai.com/v1/chat/completions';
      headers={'content-type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY};
      body={model:process.env.OPENAI_CHAT_MODEL||'gpt-4o-mini',max_tokens:450,messages:[{role:'user',content:prompt}]};
    }else return res.status(400).json({error:'Unsupported AI_PROVIDER'});
    const upstream=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
    if(!upstream.ok)return res.status(502).json({error:'AI request failed'});
    const data=await upstream.json();
    const raw=provider==='anthropic'?data.content?.find(x=>x.type==='text')?.text:data.choices?.[0]?.message?.content;
    if(typeof raw!=='string')return res.status(502).json({error:'Empty AI response'});
    const match=raw.match(/\{[\s\S]*\}/);
    if(!match)return res.status(502).json({error:'Invalid AI response'});
    const obj=JSON.parse(match[0]);
    const result={scene:String(obj.scene||'').slice(0,350),memory:String(obj.memory||'').slice(0,350),sentence:String(obj.sentence||'').slice(0,350)};
    res.setHeader('Cache-Control','no-store');return res.status(200).json(result);
  }catch(error){return res.status(500).json({error:'AI processing failed'});}
};