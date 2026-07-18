module.exports = async (req, res) => {

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid messages array' });
    }


    const apiKey = process.env.OPENROUTER_API_KEY;

    const systemPrompt = `You are the SyncDEV AI Learning Assistant, a friendly and expert computer science tutor.
Your goal is to chat naturally with the student. You can answer coding questions, explain syllabus concepts, discuss study strategies, or help them design a study plan.

If the user asks you to create, generate, build, structure, or update a learning path, syllabus, or study roadmap:
You must provide a conversational response explaining your choices, AND at the very end of your response, output a structured roadmap in a single valid JSON block wrapped in \`\`\`json and \`\`\`.

The JSON structure MUST follow this format exactly:
{
  "id": "a unique short lowercase identifier string (e.g. networks, webdev)",
  "name": "A clear title for the roadmap",
  "pace": "A short pacing and commitment label (e.g. 3 Months • Balanced Pace)",
  "chapters": [
    {
      "name": "Stage 1: Chapter Name",
      "topics": [
        { "name": "Topic title or LeetCode question name", "done": false }
      ]
    }
  ]
}

Ensure the roadmap has 3-5 chapters, and each chapter has 2-4 concrete, actionable topics.
Keep the rest of your conversation natural, friendly, and helpful.`;


    const openRouterMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://syncdev-workspace.vercel.app",
        "X-Title": "SyncDEV"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: openRouterMessages,
        temperature: 0.7,
        max_tokens: 2500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const modelReply = result.choices[0].message.content;

    return res.status(200).json({ reply: modelReply });

  } catch (error) {
    console.error("Vercel Serverless Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
