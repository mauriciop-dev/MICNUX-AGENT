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

    // 2. DIAGNOSTIC MODE: List Available Models
    let aiResponse;
    try {
      console.log("Fetching available models...");
      const modelsList = await genAI.listModels();
      const modelIds = modelsList.models.map(m => m.name.replace("models/", ""));
      aiResponse = "🔍 DIAGNÓSTICO MICNUX 2026:\n\nModelos detectados en tu API Key:\n" + modelIds.join("\n") + "\n\nCopia estos nombres y dímelos para configurar el definitivo.";
    } catch (diagError) {
      console.error("Diagnostic Error:", diagError);
      aiResponse = "❌ Error en el diagnóstico: " + diagError.message;
    }

    // 3. Reply via Telegraf
    await bot.telegram.sendMessage(userId, aiResponse);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook General Error:", error);
    res.status(200).send("OK");
  }
};
