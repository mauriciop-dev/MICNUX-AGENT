const { Telegraf } = require("telegraf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../lib/supabase");
const { searchFiles, sendEmail, appendSheetRow, createCalendarEvent } = require("../lib/google");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🛠️ HERRAMIENTAS AUTÓNOMAS
const tools = [{
  functionDeclarations: [
    { name: "google_drive_search", description: "Busca archivos en Google Drive.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
    { name: "gmail_send_email", description: "Envía un correo profesional.", parameters: { type: "OBJECT", properties: { to: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" } }, required: ["to", "subject", "body"] } },
    { name: "google_sheets_append", description: "Registra datos en Sheets.", parameters: { type: "OBJECT", properties: { spreadsheetId: { type: "STRING" }, range: { type: "STRING" }, values: { type: "ARRAY", items: { type: "STRING" } } }, required: ["spreadsheetId", "range", "values"] } },
    { name: "google_calendar_create_event", description: "Agenda eventos en Calendar.", parameters: { type: "OBJECT", properties: { summary: { type: "STRING" }, startTime: { type: "STRING" }, endTime: { type: "STRING" } }, required: ["summary", "startTime", "endTime"] } }
  ]
}];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("Micnux is alive!");
  
  const { message } = req.body;
  if (!message || !message.text) return res.status(200).send("OK");
  
  const userId = message.from.id;
  const userName = message.from.username || message.from.first_name;
  const text = message.text;

  try {
    // 1. Log en Supabase
    try {
      await supabase.from("conversations_log").insert([{ user_id: userId.toString(), user_name: userName, content: text, source: "telegram" }]);
    } catch (e) {}

    const systemPrompt = `Eres Micnux, el Asistente Inmortal de Mauricio Pineda (Bogotá). 
Fundador de ProDig. Tienes PODERES sobre Google Workspace. Si el usuario pide algo, usa tus funciones.
Hoy es Marzo de 2026.`;

    // 2. INTENTO AUTÓNOMO (GEMINI)
    let aiResponse;
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt, tools });
      const chat = model.startChat();
      let result = await chat.sendMessage(text);
      
      const calls = result.response.functionCalls();
      if (calls && calls.length > 0) {
        const toolResults = [];
        for (const f of calls) {
          let r;
          if (f.name === "google_drive_search") r = await searchFiles(f.args.query);
          if (f.name === "gmail_send_email") r = await sendEmail(f.args.to, f.args.subject, f.args.body);
          if (f.name === "google_sheets_append") r = await appendSheetRow(f.args.spreadsheetId, f.args.range, f.args.values);
          if (f.name === "google_calendar_create_event") r = await createCalendarEvent(f.args.summary, f.args.startTime, f.args.endTime);
          toolResults.push({ functionResponse: { name: f.name, response: { content: r || "Completado" } } });
        }
        const final = await chat.sendMessage(toolResults);
        aiResponse = final.response.text();
      } else {
        aiResponse = result.response.text();
      }
    } catch (geminiError) {
      console.error("Gemini Error:", geminiError.message);
      // FALLBACK A GROQ (Sin autonomía, pero responde)
      const Groq = require("groq-sdk");
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
      });
      aiResponse = completion.choices[0].message.content + "\n\n(⚡ Cerebro: Groq Fallback)";
    }

    await bot.telegram.sendMessage(userId, aiResponse, { parse_mode: "Markdown" });
    return res.status(200).send("OK");

  } catch (criticalError) {
    console.error("Critical Error:", criticalError.message);
    await bot.telegram.sendMessage(userId, "🚨 *Micnux Diagnóstico:* Tuve un error crítico en mi núcleo. Revisando mis motores... \nError: " + criticalError.message);
    return res.status(200).send("Error handled");
  }
};
