const { Telegraf } = require("telegraf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const supabase = require("../lib/supabase");
const { searchFiles, sendEmail, appendSheetRow, readSheet, createCalendarEvent } = require("../lib/google");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🛠️ HERRAMIENTAS UNIFICADAS (Poder Total para ambos cerebros)
const geminiTools = [{
  functionDeclarations: [
    { name: "search_drive", description: "Busca y gestiona archivos en Drive.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
    { name: "read_sheet", description: "Lee datos completos de cualquier Excel/Google Sheet.", parameters: { type: "OBJECT", properties: { id: { type: "STRING" }, range: { type: "STRING" } }, required: ["id", "range"] } },
    { name: "log_sheet", description: "Registra, escribe o edita filas en Sheets.", parameters: { type: "OBJECT", properties: { id: { type: "STRING" }, range: { type: "STRING" }, values: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "range", "values"] } },
    { name: "send_email", description: "Envía correos profesionales de ProDig.", parameters: { type: "OBJECT", properties: { to: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" } }, required: ["to", "subject", "body"] } },
    { name: "add_event", description: "Agenda eventos en el calendario de Mauricio.", parameters: { type: "OBJECT", properties: { summary: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["summary", "start", "end"] } }
  ]
}];

const groqTools = [
  { type: "function", function: { name: "search_drive", description: "Manage Drive files", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "read_sheet", description: "Full Read from Google Sheets", parameters: { type: "object", properties: { id: { type: "string" }, range: { type: "string" } }, required: ["id", "range"] } } },
  { type: "function", function: { name: "log_sheet", description: "Full Write/Log to Google Sheets", parameters: { type: "object", properties: { id: { type: "string" }, range: { type: "string" }, values: { type: "array", items: { type: "string" } } }, required: ["id", "range", "values"] } } },
  { type: "function", function: { name: "send_email", description: "Send professional email", parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } } },
  { type: "function", function: { name: "add_event", description: "Add calendar schedule", parameters: { type: "object", properties: { summary: { type: "string" }, start: { type: "string" }, end: { type: "string" } }, required: ["summary", "start", "end"] } } }
];

async function executeTool(name, args) {
  // Manejo de parámetros de diversas formas (para mayor flexibilidad de la IA)
  const id = args.id || args.spreadsheetId || args.docId;
  const start = args.start || args.startTime;
  const end = args.end || args.endTime;
  
  if (name === "search_drive") return await searchFiles(args.query);
  if (name === "read_sheet") return await readSheet(id, args.range);
  if (name === "log_sheet") return await appendSheetRow(id, args.range, args.values);
  if (name === "send_email") return await sendEmail(args.to, args.subject, args.body);
  if (name === "add_event") return await createCalendarEvent(args.summary, start, end);
  return "Error: Herramienta no accesible.";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("OK");
  const { message } = req.body;
  if (!message || !message.text) return res.status(200).send("OK");

  const text = message.text;
  const userId = message.from.id;
  const userName = message.from.username || message.from.first_name;
  const systemPrompt = `Eres Micnux, el Asistente Inmortal Autónomo Nivel Fundador de Mauricio Pineda.
Tienes CONTROL TOTAL sobre Google Drive, Gmail, Sheets, Calendar y Contactos. 
Si el usuario pide buscar, leer, enviar o agendar cualquier cosa en Google, USA TUS FUNCIONES de inmediato.
Siempre sé técnico, autoritario pero leal, y protector de los activos de ProDig. 
Hoy es Marzo de 2026.`;

  try {
    let aiResponse;
    let brain;

    try {
      // 1. INTENTO GEMINI
      brain = "Gemini Sovereign";
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt, tools: geminiTools });
      const chat = model.startChat();
      let result = await chat.sendMessage(text);
      const calls = result.response.functionCalls();
      if (calls && calls.length > 0) {
        const toolResults = [];
        for (const f of calls) {
          const r = await executeTool(f.name, f.args);
          toolResults.push({ functionResponse: { name: f.name, response: { content: JSON.stringify(r) } } });
        }
        const final = await chat.sendMessage(toolResults);
        aiResponse = final.response.text();
      } else aiResponse = result.response.text();
    } catch (e) {
      // 2. FALLBACK GROQ (Sincronizado)
      console.log("Activando Escudo Groq...");
      brain = "Groq Sovereign (Llama 3.3)";
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
        tools: groqTools
      });
      const tool_calls = response.choices[0].message.tool_calls;
      if (tool_calls) {
        const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: text }, response.choices[0].message];
        for (const tc of tool_calls) {
          const r = await executeTool(tc.function.name, JSON.parse(tc.function.arguments));
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(r) });
        }
        const final = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages });
        aiResponse = final.choices[0].message.content;
      } else aiResponse = response.choices[0].message.content;
    }

    const finalMsg = `${aiResponse}\n\n(⚡ Cerebro: ${brain})`;
    try {
      await bot.telegram.sendMessage(userId, finalMsg, { parse_mode: "Markdown" });
    } catch (p) { await bot.telegram.sendMessage(userId, finalMsg); }
    return res.status(200).send("OK");
  } catch (error) {
    await bot.telegram.sendMessage(userId, "🚨 *Micnux Sovereign Crash:* " + error.message);
    return res.status(200).send("OK");
  }
};
