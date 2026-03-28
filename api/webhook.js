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

    // 2. Process with Gemini (with Fallbacks)
    let aiResponse;
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(text);
        aiResponse = result.response.text();
        if (aiResponse) break; 
      } catch (err) {
        console.error(`Failed with ${modelName}:`, err.message);
        lastError = err;
      }
    }

    if (!aiResponse) {
      console.error("All models failed. Last error details:", lastError);
      aiResponse = "Lo siento, Mauricio. Hubo un error de conexión con la IA de Google. Revisa los logs de Vercel para ver los detalles del error.";
    }

    // 3. Reply via Telegraf
    await bot.telegram.sendMessage(userId, aiResponse);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook General Error:", error);
    res.status(200).send("OK");
  }
};
