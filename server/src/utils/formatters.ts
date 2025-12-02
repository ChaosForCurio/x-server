export function extractJsonObject(payload: string) {
  // Remove markdown code blocks if present
  let cleanPayload = payload.replace(/```json\s*|\s*```/g, "").trim();

  // Find the first '{' and the last '}'
  const start = cleanPayload.indexOf("{");
  const end = cleanPayload.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Unable to parse JSON payload: No JSON object found");
  }

  const snippet = cleanPayload.substring(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch (e) {
    throw new Error(`JSON Parse failed: ${(e as Error).message}`);
  }
}

export function normalizeHashtags(raw?: string | string[]) {
  const initial = Array.isArray(raw) ? raw : raw ? raw.split(/[\s,]+/) : [];
  return initial
    .map((value) => value.replace(/#/g, "").trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("#") ? value : `#${value}`));
}

export function limitLength(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit).trim()}...`;
}

export function ensureString(value: any): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value.text) return String(value.text);
    if (value.content) return String(value.content);
    if (value.url) return String(value.url);
    return JSON.stringify(value);
  }
  return String(value);
}
