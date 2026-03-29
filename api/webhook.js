const { Telegraf } = require("telegraf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../lib/supabase");
const { searchFiles, sendEmail, appendSheetRow, createCalendarEvent } = require("../lib/google");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🛠️ DEFINICIÓN DE HERRAMIENTAS AUTÓNOMAS
const tools = [{
  functionDeclarations: [
    {
      name: "google_drive_search",
      description: "Busca archivos en el Google Drive de Mauricio Pineda.",
      parameters: {
        type: "OBJECT",
        properties: { query: { type: "STRING", description: "Término de búsqueda" } },
        required: ["query"]
      }
    },
    {
      name: "gmail_send_email",
      description: "Envía un correo electrónico profesional.",
      parameters: {
        type: "OBJECT",
        properties: {
          to: { type: "STRING" },
          subject: { type: "STRING" },
          body: { type: "STRING" }
        },
        required: ["to", "subject", "body"]
      }
    },
    {
      name: "google_sheets_append",
      description: "Registra datos en una hoja de cálculo.",
      parameters: {
        type: "OBJECT",
        properties: {
          spreadsheetId: { type: "STRING" },
          range: { type: "STRING" },
          values: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["spreadsheetId", "range", "values"]
      }
    },
    {
      name: "google_calendar_create_event",
      description: "Agenda un evento en el calendario.",
      parameters: {
        type: "OBJECT",
        properties: {
          summary: { type: "STRING" },
          startTime: { type: "STRING" },
          endTime: { type: "STRING" },
          description: { type: "STRING" }
        },
        required: ["summary", "startTime", "endTime"]
      }
    }
  ]
}];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("Micnux is alive!");

  try {
    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send("No message text");

    const text = message.text;
    const userId = message.from.id;
    const userName = message.from.username || message.from.first_name;

    // 1. Log en Supabase
    try {
      await supabase.from("conversations_log").insert([{ user_id: userId.toString(), user_name: userName, content: text, source: "telegram" }]);
    } catch (e) { console.error("Log Error:", e.message); }

    const systemPrompt = `Eres Micnux, el Asistente Inmortal Autónomo de Mauricio Pineda (Bogotá). 
Fundador de ProDig. Tienes PODERES TOTALES sobre Google Workspace. 
Si el usuario pide buscar, enviar mail o agendar, usa tus funciones de inmediato. 
Estamos en Marzo de 2026.`;

    // 2. PROCESAMIENTO AUTÓNOMO (GEMINI)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt, tools });
    const chat = model.startChat();
    let result = await chat.sendMessage(text);
    let aiResponse;

    const call = result.response.functionCalls();
    if (call && call.length > 0) {
      const toolResults = [];
      for (const f of call) {
        let functionResult;
        if (f.name === "google_drive_search") functionResult = await searchFiles(f.args.query);
        if (f.name === "gmail_send_email") functionResult = await sendEmail(f.args.to, f.args.subject, f.args.body);
        if (f.name === "google_sheets_append") functionResult = await appendSheetRow(f.args.spreadsheetId, f.args.range, f.args.values);
        if (f.name === "google_calendar_create_event") functionResult = await createCalendarEvent(f.args.summary, f.args.startTime, f.args.endTime, f.args.description);
        
        toolResults.push({
          functionResponse: { name: f.name, response: { content: functionResult || "OK" } }
        });
      }
      const finalResult = await chat.sendMessage(toolResults);
      aiResponse = finalResult.response.text();
    } else {
      aiResponse = result.response.text();
    }

    await bot.telegram.sendMessage(userId, aiResponse, { parse_mode: "Markdown" });
    return res.status(200).send("OK");

  } catch (error) {
    console.error("Critical Error:", error.message);
    return res.status(200).send("Error handled");
  }
};
