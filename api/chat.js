// Vercel serverless API. Set OPENAI_API_KEY in Vercel environment settings.
// The key is never sent to the browser.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Method not allowed'}); }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:'AI_NOT_CONFIGURED'});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const safe = history.filter(m => ['user','assistant'].includes(m?.role) && typeof m.content === 'string').map(m => ({role:m.role,content:m.content.slice(0,700)}));
    if (!safe.length || safe[safe.length-1].role !== 'user') return res.status(400).json({error:'No user message'});
    const prompt = 'You are a friendly English speaking tutor for a Korean learner at TOEIC Speaking IM1 level. Speak in simple, natural English (1-2 short sentences), ask exactly one follow-up question, keep the conversation flowing. Avoid giving grammar lectures in the spoken reply. No markdown. Keep each reply under 55 words. Topic: '+String(body.topic || 'daily life').slice(0,70)+'.';
    const upstream = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',temperature:0.65,max_tokens:130,messages:[{role:'system',content:prompt},...safe]})
    });
    if (!upstream.ok) return res.status(502).json({error:'AI_UPSTREAM_ERROR'});
    const data=await upstream.json();
    const reply=data?.choices?.[0]?.message?.content;
    if(typeof reply!=='string'||!reply.trim())return res.status(502).json({error:'EMPTY_AI_REPLY'});
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({reply:reply.trim().slice(0,500)});
  } catch(e) { return res.status(500).json({error:'CHAT_FAILED'}); }
};
