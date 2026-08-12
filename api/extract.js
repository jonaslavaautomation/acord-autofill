// Serverless function (Vercel) — keeps your Groq API key on the server.
// The browser posts { text, system }; this relays it to Groq and returns the result.
// Set GROQ_API_KEY (and optionally GROQ_MODEL) in your Vercel project settings.
// Get a free key at https://console.groq.com/keys

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY is not set in the server environment." });
    return;
  }
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  // Body is auto-parsed by Vercel when content-type is JSON; fall back to manual parse.
  let body = req.body;
  if (!body || typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { body = {}; }
  }
  const text = (body && body.text) || "";
  const system = (body && body.system) || "";
  if (!text.trim()) {
    res.status(400).json({ error: "Missing 'text'." });
    return;
  }

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: (data && data.error && data.error.message) || "Groq API error", detail: data });
      return;
    }
    // Return just the extracted text content for the browser to JSON.parse.
    const out = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    res.status(200).json({ text: out });
  } catch (e) {
    res.status(500).json({ error: "Request to Groq failed.", detail: String(e) });
  }
};
