import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, system } = req.body;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: system || "",
      messages: messages || [],
    });

    const text = (response.content || [])
      .map((block) => block.text || "")
      .join("\n");

    return res.status(200).json({ text });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message || "Claude API request failed",
    });
  }
}
