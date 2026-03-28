const { Telegraf } = require("telegraf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../lib/supabase");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("Micnux is alive!");
  }

  try {
    const { message } = req.body;
    if (!message || !message.text) {
      return res.status(200).send("No message text");
    }

    const text = message.text;
    const userId = message.from.id;
    const userName = message.from.username || message.from.first_name;

    // 1. Log in Supabase (Conversations) - Optional
    try {
      await supabase.from("conversations_log").insert([
        { 
          user_id: userId.toString(), 
          user_name: userName,
          content: text, 
          source: "telegram"
        }
      ]);
    } catch (dbError) {
      console.error("Supabase Log Error (Ignored):", dbError.message);
    }

    // 2. MULTI-MODEL RESILIENCY 2026 (GEMINI -> GROQ -> DEEPSEEK)
    let aiResponse;
    
    // 2a. Try Gemini (Silent Try)
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(text);
      aiResponse = result.response.text();
    } catch (e) { console.log("Gemini Skip..."); }

    // 2b. Try GROQ (Modern 2026 Model)
    if (!aiResponse && process.env.GROQ_API_KEY) {
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: text }]
          })
        });
        if (groqResponse.ok) {
          const groqData = await groqResponse.json();
          aiResponse = groqData.choices[0].message.content + "\n\n(⚡ Cerebro: Groq 2026)";
        }
      } catch (e) { console.log("Groq Skip..."); }
    }

    // 2c. Try DEEPSEEK (The New Powerhouse)
    if (!aiResponse && process.env.DEEPSEEK_API_KEY) {
      try {
        const dsResponse = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: text }]
          })
        });
        if (dsResponse.ok) {
          const dsData = await dsResponse.json();
          aiResponse = dsData.choices[0].message.content + "\n\n(🌌 Cerebro: DeepSeek)";
        }
      } catch (e) { console.error("DeepSeek Failed:", e); }
    }

    if (!aiResponse) {
      aiResponse = "🚨 ERROR TOTAL 2026: Todos los cerebros (Gemini, Groq y DeepSeek) fallaron. Revisa tus API Keys y cuotas en Vercel.";
    }

    // 3. Reply via Telegraf
    await bot.telegram.sendMessage(userId, aiResponse);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook General Error:", error);
    res.status(200).send("OK");
  }
};
