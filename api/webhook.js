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

    // 2. MULTI-MODEL RESILIENCY (GEMINI -> GROQ)
    let aiResponse;
    const geminiModels = ["gemini-1.5-flash", "gemini-2.0-flash"];
    
    // 2a. Try Gemini First
    for (const modelId of geminiModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(text);
        aiResponse = result.response.text();
        if (aiResponse) break;
      } catch (err) {
        console.error(`Gemini ${modelId} failed:`, err.message);
      }
    }

    // 2b. Emergency Fallback: GROQ (Using native fetch for speed and zero-configs)
    if (!aiResponse && process.env.GROQ_API_KEY) {
      try {
        console.log("Switching to GROQ for resiliency...");
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama3-70b-8192",
            messages: [{ role: "user", content: text }]
          })
        });
        const groqData = await groqResponse.json();
        aiResponse = groqData.choices[0].message.content + "\n\n(⚡ Resiliencia: Respondiendo vía Groq)";
      } catch (groqError) {
        console.error("GROQ Failure:", groqError);
      }
    }

    if (!aiResponse) {
      aiResponse = "🚨 ERROR TOTAL: Todos los cerebros (Gemini y Groq) fallaron. Revisa tus API Keys y cuotas.";
    }

    // 3. Reply via Telegraf
    await bot.telegram.sendMessage(userId, aiResponse);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook General Error:", error);
    res.status(200).send("OK");
  }
};
