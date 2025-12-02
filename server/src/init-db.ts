import * as dotenv from 'dotenv';
dotenv.config();
import { initDB } from './services/dbService';

async function runInit() {
    console.log('Initializing database...');
    await initDB();
    console.log('Database initialization complete.');
}

runInit();
