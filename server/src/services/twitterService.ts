import { TwitterApi } from "twitter-api-v2";

let rwClient: any;

function getClient() {
    if (rwClient) return rwClient;

    const appKey = process.env.TWITTER_API_KEY;
    const appSecret = process.env.TWITTER_API_SECRET_KEY;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
        console.warn("Twitter API keys missing. Twitter functionality will be disabled.");
        return null;
    }

    console.log(`[Twitter] Initializing client with Access Token prefix: ${accessToken.substring(0, 5)}...`);

    try {
        const client = new TwitterApi({
            appKey,
            appSecret,
            accessToken,
            accessSecret,
        });

        rwClient = client.readWrite;
        return rwClient;
    } catch (error) {
        console.error("Error initializing Twitter client:", error);
        return null;
    }
}

export async function uploadMedia(buffer: Buffer, mimeType: string) {
    const client = getClient();
    if (!client) {
        throw new Error("Twitter API keys are not configured.");
    }
    try {
        const mediaId = await client.v1.uploadMedia(buffer, { mimeType });
        return mediaId;
    } catch (error: any) {
        console.error("Error uploading media to Twitter:", JSON.stringify(error, null, 2));
        if (error.data) {
            console.error("Twitter API Error Data:", JSON.stringify(error.data, null, 2));
        }
        if (error.code === 403 || error.data?.status === 403) {
            throw new Error("Twitter API 403 Forbidden: Your App likely has 'Read-only' permissions. Please enable 'Read and Write' in the Twitter Developer Portal.");
        }
        throw new Error(`Failed to upload media to Twitter: ${error.message}`);
    }
}

export async function postTweet(text: string, mediaIds?: string[]) {
    const client = getClient();
    if (!client) {
        throw new Error("Twitter API keys are not configured.");
    }
    try {
        const payload: any = { text };
        if (mediaIds && mediaIds.length > 0) {
            payload.media = { media_ids: mediaIds };
        }
        const response = await client.v2.tweet(payload);
        return response;
    } catch (error: any) {
        console.error("Error posting tweet:", JSON.stringify(error, null, 2));
        if (error.data) {
            console.error("Twitter API Error Data:", JSON.stringify(error.data, null, 2));
        }
        if (error.code === 403 || error.data?.status === 403) {
            throw new Error("Twitter API 403 Forbidden: Your App likely has 'Read-only' permissions. Please enable 'Read and Write' in the Twitter Developer Portal.");
        }
        throw new Error(`Failed to post tweet: ${error.message}`);
    }
}
