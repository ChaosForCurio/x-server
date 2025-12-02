import express from "express";
import multer from "multer";
import { generateSocialPost, analyzePdf } from "../services/geminiService";
import { saveContent, getLatestContent } from "../services/dbService";
import { generateImage } from "../services/freepikService";
import { postTweet, uploadMedia } from "../services/twitterService";
import { uploadImage } from "../services/cloudinaryService";
import { saveImageMetadata } from "../services/firebaseService";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function logErrorToFile(message: string, data?: any) {
    console.error(message, data);
}

router.get("/debug-test", (req, res) => {
    console.log("Debug test endpoint called");
    logErrorToFile("Debug test endpoint called", { test: true });
    res.json({ status: "ok", message: "Logging enabled" });
});

router.post("/generate", async (req, res) => {
    try {
        const { prompt, topic, tone, style, hashtags, cta, imageIdea } = req.body;
        if (!prompt) {
            res.status(400).json({ error: "Prompt is required" });
            return;
        }
        const result = await generateSocialPost({
            prompt,
            topic,
            tone,
            style,
            hashtags,
            cta,
            imageIdea
        });
        res.json(result);
    } catch (error: any) {
        console.error("Error generating post:", error);
        logErrorToFile("Error generating post (Route Handler):", error.message);
        if (error.message.includes("rate limit")) {
            res.status(429).json({ error: "Gemini API rate limit exceeded. Please try again later." });
        } else if (error.message.includes("403 Forbidden")) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({
                error: error.message || "Internal server error",
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
});
router.post("/generate-image", async (req, res) => {
    try {
        const { prompt, userDetails } = req.body;
        if (!prompt) {
            res.status(400).json({ error: "Prompt is required" });
            return;
        }
        const result = await generateImage(prompt);

        // Upload to Cloudinary
        let imageUrl = result.source;
        if (result.buffer) {
            try {
                imageUrl = await uploadImage(result.buffer);
            } catch (uploadError) {
                console.error("Failed to upload to Cloudinary, falling back to original source:", uploadError);
            }
        }

        // Save metadata to Firebase
        try {
            await saveImageMetadata(imageUrl, prompt, userDetails);
        } catch (firebaseError) {
            console.error("Failed to save metadata to Firebase:", firebaseError);
        }

        // Save to Neon for persistence
        try {
            await saveContent(imageUrl, 'generated_image', { prompt });
        } catch (neonError) {
            console.error("Failed to save image to Neon:", neonError);
        }

        // Convert buffer to base64 for frontend display (keep existing behavior for immediate display)
        const base64 = result.buffer.toString("base64");
        res.json({
            image: `data:${result.mimeType};base64,${base64}`,
            source: imageUrl // Return Cloudinary URL (or original if upload failed)
        });
    } catch (error: any) {
        console.error("Error generating image:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

router.get("/latest", async (req, res) => {
    try {
        const latestPost = await getLatestContent('social_post');
        const latestImage = await getLatestContent('generated_image');

        res.json({
            post: latestPost ? {
                text: latestPost.content,
                ...latestPost.metadata
            } : null,
            image: latestImage ? {
                url: latestImage.content,
                prompt: latestImage.metadata?.prompt
            } : null
        });
    } catch (error: any) {
        console.error("Error fetching latest content:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

router.post("/analyze-pdf", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "File is required" });
            return;
        }
        const result = await analyzePdf(req.file.buffer);
        res.json(result);
    } catch (error: any) {
        console.error("Error analyzing PDF:", error);
        if (error.message.includes("rate limit")) {
            res.status(429).json({ error: "Gemini API rate limit exceeded. Please try again later." });
        } else {
            res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
});

router.post("/post", async (req, res) => {
    try {
        const { text, image } = req.body;
        console.log("Received post request:", { text, image: image ? (image.startsWith("data:") ? "base64_image" : image) : "no_image" });

        if (!text) {
            res.status(400).json({ error: "Text is required" });
            return;
        }

        let mediaIds: string[] = [];
        if (image) {
            try {
                let buffer: Buffer;
                let mimeType: string;

                if (image.startsWith("http")) {
                    console.log("Fetching image from URL:", image);
                    const imageRes = await fetch(image);
                    if (!imageRes.ok) throw new Error(`Failed to fetch image from URL: ${imageRes.statusText}`);
                    const arrayBuffer = await imageRes.arrayBuffer();
                    buffer = Buffer.from(arrayBuffer);
                    mimeType = imageRes.headers.get("content-type") || "image/jpeg";
                } else if (image.startsWith("data:")) {
                    console.log("Processing base64 image");
                    const matches = image.match(/^data:(.+);base64,(.+)$/);
                    if (matches) {
                        mimeType = matches[1];
                        buffer = Buffer.from(matches[2], "base64");
                    } else {
                        throw new Error("Invalid base64 image format");
                    }
                } else {
                    throw new Error("Invalid image format. Must be URL or base64.");
                }

                console.log(`Uploading media to Twitter. Type: ${mimeType}, Size: ${buffer.length} bytes`);
                const mediaId = await uploadMedia(buffer, mimeType);
                console.log("Media uploaded successfully, ID:", mediaId);
                mediaIds.push(mediaId);
            } catch (imgError: any) {
                console.error("Error processing/uploading image:", imgError);
                // We continue posting text even if image fails, or you might want to fail hard.
                // For now, let's fail hard so user knows image didn't post.
                throw new Error(`Image processing failed: ${imgError.message}`);
            }
        }

        console.log("Posting tweet with media IDs:", mediaIds);
        const result = await postTweet(text, mediaIds);
        console.log("Tweet posted successfully:", result);
        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error("Error posting tweet:", error);
        if (error.message.includes("403 Forbidden")) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
});

export default router;
