// Serverless function (Vercel) — keeps your Anthropic API key on the server.
// The browser posts { text, system }; this relays it to Anthropic and returns the result.
// Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) in your Vercel project settings.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in the server environment." });
    return;
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

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
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: (data && data.error && data.error.message) || "Anthropic API error", detail: data });
      return;
    }
    // Return just the extracted text content for the browser to JSON.parse.
    const out = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    res.status(200).json({ text: out });
  } catch (e) {
    res.status(500).json({ error: "Request to Anthropic failed.", detail: String(e) });
  }
};
