const { Telegraf } = require("telegraf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const axios = require("axios");
const supabase = require("../lib/supabase");
const { 
  searchFiles, sendEmail, listEmails, appendSheetRow, readSheet, 
  createCalendarEvent, listCalendarEvents, createDocument 
} = require("../lib/google");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// HERRAMIENTAS UNIFICADAS SOBERANAS
const geminiTools = [{
  functionDeclarations: [
    { name: "search_drive", description: "Search Drive files.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
    { name: "send_email", description: "Send email with Nodemailer.", parameters: { type: "OBJECT", properties: { to: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" } }, required: ["to", "subject", "body"] } },
    { name: "read_sheet", description: "Read Excel contacts.", parameters: { type: "OBJECT", properties: { id: { type: "STRING" }, range: { type: "STRING" } }, required: ["id", "range"] } },
    { name: "add_event", description: "Schedule calendar events.", parameters: { type: "OBJECT", properties: { summary: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["summary", "start", "end"] } }
  ]
}];

async function executeTool(name, args) {
  const id = args.id || args.spreadsheetId || args.docId;
  const start = args.start || args.startTime;
  const end = args.end || args.endTime;
  if (name === "search_drive") return await searchFiles(args.query);
  if (name === "send_email") return await sendEmail(args.to, args.subject, args.body);
  if (name === "read_sheet") return await readSheet(id, args.range);
  if (name === "add_event") return await createCalendarEvent(args.summary, start, end);
  return "Error: Herramienta no disponible.";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("OK");
  const { message } = req.body;
  if (!message) return res.status(200).send("OK");

  const userId = message.from.id;
  const userName = message.from.username || message.from.first_name;
  let audioData = null;

  // 🎙️ PROCESAMIENTO MULTIMODAL (Si hay voz)
  if (message.voice) {
    try {
      const fileLink = await bot.telegram.getFileLink(message.voice.file_id);
      const audioRes = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const base64Audio = Buffer.from(audioRes.data).toString("base64");
      audioData = { inlineData: { mimeType: "audio/ogg", data: base64Audio } };
    } catch (e) { console.log("Audio Download Error:", e.message); }
  }

  const userText = message.text || "";
  if (!userText && !audioData) return res.status(200).send("OK");

  try {
    let historyContext = "";
    try {
      const { data } = await supabase.from("conversations_log").select("content, source").eq("user_id", userId.toString()).order("created_at", { ascending: false }).limit(5);
      if (data) historyContext = "CONTEXTO RECIENTE:\n" + data.reverse().map(l => `- ${l.source === "telegram" ? "Usuario" : "Micnux"}: ${l.content}`).join("\n");
      await supabase.from("conversations_log").insert([{ user_id: userId.toString(), user_name: userName, content: userText || "[Audio de voz]", source: "telegram" }]);
    } catch (e) {}

    const today = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const systemPrompt = `Eres Micnux, el Asistente Soberano. AHORA ES: ${today}.
Recuerda el contexto: ${historyContext}.
Si el usuario envía audio, escúchalo y procesa sus órdenes usando tus herramientas de Drive, Gmail, Calendar y Sheets.`;

    let aiResponse;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt, tools: geminiTools });

    // 🧠 LÓGICA MULTIMODAL (Gemini procesa texto y audio a la vez)
    const promptParts = [userText];
    if (audioData) promptParts.push(audioData);

    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const calls = response.functionCalls();

    if (calls && calls.length > 0) {
      const toolResults = [];
      for (const f of calls) {
        const r = await executeTool(f.name, f.args);
        toolResults.push({ functionResponse: { name: f.name, response: { content: JSON.stringify(r) } } });
      }
      // Gemini 1.5 es un Agente real, procesa los resultados de las herramientas
      const finalResult = await model.generateContent([...promptParts, { role: "model", content: { parts: response.candidates[0].content.parts } }, { role: "user", content: { parts: toolResults } }]);
      aiResponse = finalResult.response.text();
    } else {
      aiResponse = response.text();
    }

    const finalMsg = `${aiResponse}\n\n(⚡ Cerebro: Gemini Native AI Master)`;
    try { await supabase.from("conversations_log").insert([{ user_id: userId.toString(), user_name: userName, content: aiResponse, source: "micnux" }]); } catch (e) {}
    try { await bot.telegram.sendMessage(userId, finalMsg, { parse_mode: "Markdown" }); } catch (p) { await bot.telegram.sendMessage(userId, finalMsg); }
    return res.status(200).send("OK");
  } catch (error) {
    await bot.telegram.sendMessage(userId, "🚨 *Critical AI Crash:* " + error.message);
    return res.status(200).send("OK");
  }
};
