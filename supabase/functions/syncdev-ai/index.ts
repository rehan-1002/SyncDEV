import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  // Handle pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Retrieve API key securely from environment secrets
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY') || "sk-08ebb6c8fa57407dbe470f321453479f";

    // System instructions to enforce JSON output matching the front-end structure
    const systemPrompt = `
You are the SyncDEV AI Curriculum Alignment Engine.
Your task is to take the student's request, career goals, or exam topics, and synthesize a structured study roadmap in raw JSON format.
You must return ONLY a JSON block, with no additional explanation or Markdown formatting codes (do not wrap in \`\`\`json).

The output JSON structure MUST look EXACTLY like this:
{
  "id": "a unique lowercase string for the subject id (e.g. webdev)",
  "name": "A clear title for the roadmap",
  "pace": "A short pacing label (e.g. 3 Months • Balanced Pace)",
  "chapters": [
    {
      "name": "Stage 1: Chapter Name",
      "topics": [
        { "name": "Topic title or LeetCode question name", "done": false }
      ]
    }
  ]
}

Ensure the generated roadmap has 3-5 stages (chapters) and each stage has 2-4 concrete, actionable topics or coding practices.
`;

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const modelReply = result.choices[0].message.content.trim();

    // Sanitize any accidentally wrapped markdown formatting
    let cleanJson = modelReply;
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    // Try parsing to validate structure
    const parsedData = JSON.parse(cleanJson);

    return new Response(JSON.stringify(parsedData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
