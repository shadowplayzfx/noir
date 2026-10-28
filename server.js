import "dotenv/config";
import express from "express";

const app = express();
const KEY = process.env.OPENROUTER_API_KEY;
const PORT = process.env.PORT || 3000;

const MODELS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const MODES = {
  explain: "Explain concepts step by step with simple examples, then check understanding.",
  practice: "Give ONE practice problem at a time, wait for the learner's answer, then give feedback and the next problem.",
  quiz: "Run a short quiz: ask ONE question at a time, grade the answer, explain mistakes, and keep a running score.",
  homework: "Give hints first and guide the learner. Never reveal the full solution unless they explicitly ask for it.",
};
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

const tutorPrompt = (name, mode, level) => `You are a friendly, patient AI tutor talking to ${name}.
Learner level: ${level}. Match your vocabulary and depth to this level.
Teaching mode: ${MODES[mode]}
- Use short examples and analogies; for maths/science show worked steps.
- Ask one small follow-up question at the end to keep the learner engaged.
- Format with Markdown; put code in fenced blocks. Be encouraging and concise.`;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("dist")); // production build of the React app

app.get("/api/models", (_, res) => res.json(MODELS));

app.post("/api/chat", async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "OPENROUTER_API_KEY missing in .env" });
  const { messages = [], model, name = "friend", mode = "explain", level = "Beginner" } = req.body;
  if (!MODELS.includes(model)) return res.status(400).json({ error: "Unknown model" });
  if (!MODES[mode] || !LEVELS.includes(level)) return res.status(400).json({ error: "Bad mode or level" });

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": `http://localhost:${PORT}`,
        "X-Title": "AI Tutor",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: tutorPrompt(String(name).slice(0, 40), mode, level) },
          ...messages.slice(-24),
        ],
      }),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: await upstream.text() });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.end();
  }
});

app.listen(PORT, () => console.log(`AI Tutor API → http://localhost:${PORT}`));
