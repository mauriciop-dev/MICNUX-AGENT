const { Telegraf } = require("telegraf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../lib/supabase");
const { searchFiles, sendEmail } = require("../lib/google"); // <--- MÁS PODERES

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

    // 0a. COMANDO DRIVE
    if (text.startsWith("/drive")) {
      const query = text.replace("/drive", "").trim();
      const files = await searchFiles(query);
      if (!files || files.length === 0) {
        await bot.telegram.sendMessage(userId, "📂 *Google Drive:* No encontré nada. ¿Me compartiste la carpeta?", { parse_mode: "Markdown" });
        return res.status(200).send("OK");
      }
      let response = "📂 *Drive (2026):*\n\n";
      files.forEach(f => { response += `• [${f.name}](${f.webViewLink})\n`; });
      await bot.telegram.sendMessage(userId, response, { parse_mode: "Markdown" });
      return res.status(200).send("OK");
    }

    // 0b. COMANDO GMAIL: /mail [destino] [Subject]: Body
    if (text.startsWith("/mail")) {
      const match = text.match(/\/mail ([^ ]+) (\[(.*)\])?:? (.*)/);
      if (!match) {
        await bot.telegram.sendMessage(userId, "📧 *Uso:* `/mail [correo] [Asunto]: Cuerpo del mensaje`", { parse_mode: "Markdown" });
        return res.status(200).send("OK");
      }
      const [_, to, __, subject, body] = match;
      const result = await sendEmail(to, subject || "Mensaje de Micnux", body);
      if (result) {
        await bot.telegram.sendMessage(userId, `📧 *Gmail:* ¡Correo enviado con éxito a \`${to}\`!`, { parse_mode: "Markdown" });
      } else {
        await bot.telegram.sendMessage(userId, "🚨 *Error:* No pude enviar el correo. Revisa mis permisos de Gmail API.");
      }
      return res.status(200).send("OK");
    }

    // 1. Log en Supabase
    try {
      await supabase.from("conversations_log").insert([{ user_id: userId.toString(), user_name: userName, content: text, source: "telegram" }]);
    } catch (e) { console.error("Log Error:", e.message); }

    // 2. SYSTEM PROMPT (IDENTITY 2026)
    const systemPrompt = `Eres Micnux, el Asistente Inmortal de Mauricio Pineda (Bogotá).
Fundador de ProDig (Prospectiva Digital). Tienes acceso a su Google Drive y Gmail. 
- Drive: Comando /drive [query].
- Gmail: Comando /mail [correo] [Asunto]: Cuerpo.
Eres técnico, visionario y fiel al protocolo A2A. Operas en Vercel + Supabase (Marzo 2026).`;

    // 3. MULTI-MODEL RESILIENCY 2026 (GEMINI -> GROQ -> DEEPSEEK)
    let aiResponse;
    const geminiModels = ["gemini-1.5-flash", "gemini-2.0-flash"];
    
    // 3a. Try Gemini
    for (const modelId of geminiModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId, systemInstruction: systemPrompt });
        const result = await model.generateContent(text);
        aiResponse = result.response.text();
        if (aiResponse) break;
      } catch (e) { console.log(`Gemini ${modelId} skip...`); }
    }

    // 2b. Try GROQ (llama-3.3-70b-versatile)
    if (!aiResponse && process.env.GROQ_API_KEY) {
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ]
          })
        });
        if (groqResponse.ok) {
          const groqData = await groqResponse.json();
          aiResponse = groqData.choices[0].message.content + "\n\n(⚡ Cerebro: Groq 2026)";
        }
      } catch (e) { console.log("Groq System Error:", e.message); }
    }

    // 2c. Try DEEPSEEK
    if (!aiResponse && process.env.DEEPSEEK_API_KEY) {
      try {
        const dsResponse = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ]
          })
        });
        if (dsResponse.ok) {
          const dsData = await dsResponse.json();
          aiResponse = dsData.choices[0].message.content + "\n\n(🌌 Cerebro: DeepSeek)";
        }
      } catch (e) { console.error("DeepSeek Failed:", e.message); }
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
