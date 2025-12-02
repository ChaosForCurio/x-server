import { extractJsonObject, normalizeHashtags, ensureString } from "../utils/formatters";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama3-70b-8192"; // Reliable model for JSON generation

export async function callGroq(prompt: string, systemMessage: string = "You are a helpful assistant.") {
    const key = process.env.GROQ_API_KEY;
    console.log(`[Groq] API Key configured: ${key ? 'Yes' : 'No'} (${key ? key.substring(0, 5) + '...' : 'Missing'})`);
    if (!key) {
        console.error("Groq API key is missing");
        throw new Error("Missing Groq API key");
    }

    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Groq] API Error: ${response.status}`, errorText);
            throw new Error(`Groq API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;
        return data.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("[Groq] Request Failed:", error);
        throw error;
    }
}

export async function generateSocialPostGroq(prompt: string, context: any) {
    const systemMessage = "You are an expert social media content writer who crafts engaging posts for X. Return ONLY a JSON object.";
    const template = `Generate a JSON object with keys: post_text, hashtags, image_prompt, alt_text, cta. 
    Topic: ${context.topic || "general"}. 
    Tone: ${context.tone || "friendly"}. 
    Style: ${context.style || "conversational"}. 
    Prompt: ${prompt}. 
    CTA direction: ${context.cta || "Learn more"}.
    Hashtag seeds: ${context.hashtags?.join(", ") || ""}.
    
    Ensure the response is valid JSON.`;

    const raw = await callGroq(template, systemMessage);

    try {
        const parsed = extractJsonObject(raw);
        return {
            post_text: parsed.post_text || prompt,
            hashtags: normalizeHashtags(parsed.hashtags || []),
            image_prompt: ensureString(parsed.image_prompt || context.topic),
            alt_text: ensureString(parsed.alt_text || "Generated image"),
            cta: ensureString(parsed.cta || "Check it out")
        };
    } catch (e) {
        console.error("[Groq] JSON Parse Error:", e);
        throw new Error("Failed to parse Groq response");
    }
}

export async function analyzePdfGroq(text: string) {
    const systemMessage = "You are a helpful assistant that analyzes documents. Return ONLY a JSON object.";
    const prompt = `Analyze the following document text and return a JSON object with:
    - summary (string)
    - keyTopics (array of strings)
    - suggestedTone (string)
    
    Document text: ${text.slice(0, 10000)}...`; // Truncate to avoid token limits if necessary

    const raw = await callGroq(prompt, systemMessage);

    try {
        return extractJsonObject(raw);
    } catch (e) {
        console.error("[Groq] PDF Analysis JSON Parse Error:", e);
        throw new Error("Failed to parse Groq PDF analysis response");
    }
}
