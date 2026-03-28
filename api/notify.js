const { Telegraf } = require("telegraf");
const supabase = require("../lib/supabase");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const chatId = process.env.TELEGRAM_CHAT_ID;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { agent_id, status, error_message, metadata } = req.body;

  try {
    // 1. Log in Supabase (Incidents)
    await supabase.from("prodig_incidents").insert([
      {
        agent_id: agent_id || "unknown",
        status: status || "alert",
        error_message: error_message || "No error details",
        metadata: metadata || {},
        timestamp: new Date()
      }
    ]);

    // 2. Notify Mauricio
    const alertMsg = `🚨 *ALERTA A2A* 🚨\n\n*Agente:* ${agent_id || "Desconocido"}\n*Estado:* ${status || "FALLO"}\n*Mensaje:* ${error_message || "Sin descripción"}\n\n*Dashboard:* https://supabase.com/dashboard/project/ockohhdrwrtnvqowrrqh`;
    
    await bot.telegram.sendMessage(chatId, alertMsg, { parse_mode: "Markdown" });
    
    res.status(200).json({ success: true, message: "Alert sent to Mauricio" });
  } catch (error) {
    console.error("A2A Notification Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
