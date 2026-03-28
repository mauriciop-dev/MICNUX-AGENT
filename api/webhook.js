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

    // 1. Log in Supabase (Conversations)
    await supabase.from("conversations_log").insert([
      { 
        user_id: userId.toString(), 
        user_name: userName,
        content: text, 
        source: "telegram"
      }
    ]);

    // 2. DIAGNOSTIC + FALLBACK (MARCH 2026)
    let aiResponse;
    const modelsToTry = ["gemini-3.1-flash", "gemini-2.0-flash", "gemini-pro"];
    let errorReport = "";

    for (const modelId of modelsToTry) {
      try {
        console.log(`Checking ${modelId}...`);
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(text);
        aiResponse = result.response.text();
        if (aiResponse) break;
      } catch (err) {
        errorReport += `❌ ${modelId}: ${err.message}\n`;
        console.error(`Error with ${modelId}:`, err);
      }
    }

    if (!aiResponse) {
      aiResponse = "🚨 ERROR DE CONEXIÓN (2026):\n\n" + errorReport + "\nRevisa tu GEMINI_API_KEY en Vercel.";
    }

    // 3. Reply via Telegraf
    await bot.telegram.sendMessage(userId, aiResponse);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook General Error:", error);
    res.status(200).send("OK");
  }
};
