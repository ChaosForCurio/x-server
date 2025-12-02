import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// Ensure you have the service account key JSON file and set the path in .env
// OR set the individual environment variables if you prefer not to use a file.

import * as path from 'path';

if (!admin.apps.length) {
    try {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
            : undefined;

        let serviceAccount;
        if (serviceAccountPath) {
            const fs = require('fs');
            if (fs.existsSync(serviceAccountPath)) {
                serviceAccount = require(serviceAccountPath);
            } else {
                console.warn(`Warning: Firebase service account file not found at ${serviceAccountPath}`);
            }
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('Firebase Admin initialized successfully.');
        } else {
            console.warn('FIREBASE_SERVICE_ACCOUNT_KEY not provided. Firebase integration will be disabled.');
        }
    } catch (error) {
        console.error('Error initializing Firebase Admin:', error);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

export async function saveImageMetadata(imageUrl: string, prompt: string, userDetails?: any) {
    if (!db) {
        console.warn('Firebase Firestore is not initialized. Skipping metadata save.');
        return;
    }

    try {
        const docRef = await db.collection('generated_images').add({
            imageUrl,
            prompt,
            userDetails: userDetails || {},
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('Image metadata saved to Firestore with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error saving image metadata to Firestore:', error);
        throw error;
    }
}
