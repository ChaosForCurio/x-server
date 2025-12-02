import { Pool } from 'pg';

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Neon
        }
    })
    : null;

export async function initDB() {
    if (!pool) {
        console.warn('Warning: Database URL not provided. DB features will be unavailable.');
        return;
    }
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS content_history (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Content history table initialized.');
    } catch (error) {
        console.warn('Warning: Failed to initialize database. The server will start, but DB features will be unavailable.');
        console.error('DB Error Details:', error);
    }
}

export async function saveContent(content: string, type: string, metadata: any = {}) {
    try {
        if (!pool) throw new Error('Database not initialized');
        const query = 'INSERT INTO content_history (content, type, metadata) VALUES ($1, $2, $3) RETURNING id';
        const values = [content, type, metadata];
        const res = await pool.query(query, values);
        console.log(`Content saved with ID: ${res.rows[0].id}`);
        return res.rows[0].id;
    } catch (error) {
        console.error('Error saving content:', error);
        throw error;
    }
}

export async function getContext(limit: number = 5): Promise<string> {
    try {
        if (!pool) return '';
        const query = 'SELECT content FROM content_history ORDER BY created_at DESC LIMIT $1';
        const res = await pool.query(query, [limit]);
        return res.rows.map(row => row.content).join('\n\n');
    } catch (error) {
        console.error('Error retrieving context:', error);
        return '';
    }
}

export async function getLatestContent(type: string) {
    try {
        if (!pool) throw new Error('Database not initialized');
        const query = 'SELECT * FROM content_history WHERE type = $1 ORDER BY created_at DESC LIMIT 1';
        const res = await pool.query(query, [type]);
        return res.rows[0];
    } catch (error) {
        console.error('Error retrieving latest content:', error);
        throw error;
    }
}
