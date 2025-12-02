import { extractJsonObject, normalizeHashtags, ensureString } from "../utils/formatters";
import { optionalString, requireString } from "../utils/validators";
import { saveContent, getContext } from "./dbService";
const pdfParse = require("pdf-parse");

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-1.5-flash"; // Switched to stable model
const SYSTEM_MESSAGE = "You are an expert social media content writer who crafts engaging posts for X.";

export interface PostPrompt {
  prompt: string;
  topic?: string;
  tone?: string;
  style?: string;
  hashtags?: string[];
  cta?: string;
  imageIdea?: string;
}

export interface PostContent {
  post_text: string;
  hashtags: string[];
  image_prompt: string;
  alt_text: string;
  cta: string;
}

export interface PdfAnalysis {
  summary: string;
  keyTopics: string[];
  suggestedTone: string;
}

import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve(__dirname, "../../server-error.log");

function logErrorToFile(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) : ""}\n\n`;
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}

async function callGemini(promptBody: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const msg = "Gemini API key is missing in environment variables";
    console.error(msg);
    logErrorToFile(msg);
    throw new Error("Missing Gemini API key");
  }
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  console.log(`[Gemini] Using model: ${model}`);
  console.log(`[Gemini] API Key configured: ${key ? 'Yes' : 'No'} (${key ? key.substring(0, 5) + '...' : 'Missing'})`);

  // Use generateContent endpoint
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${key}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${SYSTEM_MESSAGE}\n\n${promptBody}` }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          candidateCount: 1
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const msg = "[Gemini] API Error Details:";
      console.error(msg, JSON.stringify(errorData, null, 2));
      console.error("[Gemini] Status:", response.status);
      logErrorToFile(msg, { status: response.status, data: errorData });

      if (response.status === 429) {
        throw new Error("Gemini API rate limit exceeded. Please try again later.");
      }
      throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const payload = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!payload || typeof payload !== "string") {
      const msg = "[Gemini] Unexpected response structure:";
      console.error(msg, JSON.stringify(data, null, 2));

      // Log specific details for debugging
      if (data.candidates && data.candidates.length > 0) {
        console.error("[Gemini] Finish Reason:", data.candidates[0].finishReason);
        console.error("[Gemini] Safety Ratings:", JSON.stringify(data.candidates[0].safetyRatings, null, 2));
      }
      if (data.promptFeedback) {
        console.error("[Gemini] Prompt Feedback:", JSON.stringify(data.promptFeedback, null, 2));
      }

      logErrorToFile(msg, data);
      throw new Error(`Gemini did not return text. FinishReason: ${data.candidates?.[0]?.finishReason || 'Unknown'}. Raw response logged.`);
    }
    return payload;
  } catch (error: any) {
    console.error("[Gemini] Request Failed:", error);
    logErrorToFile("[Gemini] Request Failed:", { message: error.message, prompt: promptBody.substring(0, 100) + "..." });
    throw error;
  }
}

export async function generateSocialPost(input: PostPrompt) {
  const prompt = requireString(input.prompt, "Prompt");
  const tone = optionalString(input.tone) ?? "friendly"
  const style = optionalString(input.style) ?? "conversational"
  const topic = optionalString(input.topic) ?? "general"
  const cta = optionalString(input.cta) ?? "Learn more"
  const hashtags = input.hashtags ?? []
  const imageIdea = optionalString(input.imageIdea) ?? topic

  // Fetch context from DB
  const context = await getContext(5);
  const contextMsg = context ? `\n\nRecent posts for context:\n${context}` : "";

  const template = `Generate a JSON object with keys: post_text, hashtags, image_prompt, alt_text, cta. Tone: ${tone}. Style: ${style}. Topic: ${topic}. Prompt: ${prompt}. CTA direction: ${cta}. Image idea: ${imageIdea}. Hashtag seeds: ${hashtags.join(", ")}. IMPORTANT: The 'image_prompt' must be a detailed visual description specifically related to the topic '${topic}' and the post content.${contextMsg}`

  let raw: string;
  let parsed: any;
  try {
    raw = await callGemini(template);
    parsed = extractJsonObject(raw);
  } catch (error) {
    console.warn("[Gemini] Failed (API or Parse), attempting fallback to Groq...", error);
    try {
      const { generateSocialPostGroq } = require("./groqService");
      // Return immediately if fallback succeeds
      return await generateSocialPostGroq(prompt, { topic, tone, style, cta, hashtags, imageIdea });
    } catch (groqError: any) {
      console.error("[Groq] Fallback failed:", groqError);
      throw new Error(`Generation failed: Gemini error: ${(error as any).message}. Fallback (Groq) error: ${groqError.message}`);
    }
  }

  // If we reach here, Gemini succeeded and parsed is populated
  const finalHashtags = normalizeHashtags(parsed.hashtags ?? hashtags)

  const result = {
    post_text: limitText(parsed.post_text ?? prompt, 280),
    hashtags: finalHashtags,
    image_prompt: ensureString(parsed.image_prompt ?? imageIdea),
    alt_text: ensureString(parsed.alt_text ?? `Illustration for ${topic}`),
    cta: ensureString(parsed.cta ?? cta)
  };

  // Save generated content to DB (Non-blocking)
  try {
    await saveContent(result.post_text, 'social_post', { prompt, topic, tone, style });
  } catch (dbError) {
    console.error("Failed to save generated post to DB:", dbError);
    // Do not throw, allow the user to see the result
  }

  return result;
}

function limitText(value: unknown, limit: number) {
  if (typeof value !== "string") {
    return ""
  }
  return value.length <= limit ? value : `${value.slice(0, limit).trim()}...`
}

export async function analyzePdf(buffer: Buffer) {
  try {
    const base64Pdf = buffer.toString("base64");
    const prompt = "Analyze the following document and return a JSON object with summary, keyTopics, and suggestedTone.";

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing Gemini API key");

    const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${key}`;

    let raw: string;
    let parsed: any;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: base64Pdf
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            candidateCount: 1
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (response.status === 429) throw new Error("Gemini API rate limit exceeded.");
        throw new Error(`Gemini API Error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as any;
      raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!raw) throw new Error("Gemini did not return text");

      parsed = extractJsonObject(raw);

    } catch (error) {
      console.warn("[Gemini] PDF Analysis failed (API or Parse), attempting fallback to Groq...", error);
      try {
        const doc = await pdfParse(buffer);
        const content = typeof doc.text === 'string' ? doc.text.trim() : "";

        if (!content) {
          console.warn("PDF contains no extractable text (possibly scanned). Returning default summary.");
          return {
            summary: "Could not extract text from PDF (it might be a scanned image). Please provide a text-based PDF.",
            keyTopics: ["PDF Analysis Failed"],
            suggestedTone: "neutral"
          };
        }

        const { analyzePdfGroq } = require("./groqService");
        // Return immediately if fallback succeeds
        return await analyzePdfGroq(content);
      } catch (groqError: any) {
        console.error("[Groq] PDF Analysis Fallback failed:", groqError);
        // Return a safe default instead of throwing 500
        return {
          summary: "Analysis failed due to AI service unavailability. Please try again later.",
          keyTopics: ["Error"],
          suggestedTone: "neutral"
        };
      }
    }

    // If we are here, Gemini succeeded and parsed is set
    const topics = Array.isArray(parsed.keyTopics) ? parsed.keyTopics : typeof parsed.keyTopics === "string" ? parsed.keyTopics.split(/[\n,]+/).map((value: string) => value.trim()).filter(Boolean) : [];

    return {
      summary: parsed.summary ?? "Summary not available",
      keyTopics: topics,
      suggestedTone: parsed.suggestedTone ?? "informative"
    };
  } catch (error: any) {
    console.error("Error in analyzePdf:", error);
    logErrorToFile("Error in analyzePdf:", error.message);
    throw new Error(`Failed to analyze PDF: ${error.message}`);
  }
}
