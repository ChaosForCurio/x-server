

const ENDPOINT = "https://api.freepik.com/v1/ai/mystic";

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  source: string;
}

export async function generateImage(prompt: string) {
  const key = process.env.FREEPIK_API_KEY?.trim();

  if (!key) {
    console.error("[Freepik] Missing API Key");
    throw new Error("Missing Freepik API key");
  }
  // Log first few chars to verify key is loaded (security safe)
  console.log(`[Freepik] Using API Key starting with: ${key.substring(0, 4)}...`);
  const payload = {
    prompt,
    quality: "high",
    aspect_ratio: "16:9"
  };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Freepik] API Error:", errorText);
      console.error("[Freepik] Status:", response.status);
      // Fallback to placeholder
      // Fallback to placeholder
      console.warn("[Freepik] Switching to fallback placeholder image.");
      const fallbackBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return {
        buffer: Buffer.from(fallbackBase64, "base64"),
        mimeType: "image/png",
        source: "data:image/png;base64," + fallbackBase64
      };
    }

    const data = await response.json() as any;

    if (data?.image_base64) {
      return {
        buffer: Buffer.from(data.image_base64, "base64"),
        mimeType: "image/png",
        source: data.image_url ?? "generated"
      };
    }
    if (data?.image_url) {
      const imageResponse = await fetch(data.image_url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: imageResponse.headers.get("content-type") ?? "image/png",
        source: data.image_url
      };
    }
    throw new Error("Freepik did not return an image");
  } catch (error: any) {
    console.error("[Freepik] Request Failed:", error);
    // Fallback for network errors too
    console.warn("[Freepik] Network/Unknown error, using fallback.");

    // 1x1 pixel transparent PNG base64
    const fallbackBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    return {
      buffer: Buffer.from(fallbackBase64, "base64"),
      mimeType: "image/png",
      source: "data:image/png;base64," + fallbackBase64
    };
  }
}
