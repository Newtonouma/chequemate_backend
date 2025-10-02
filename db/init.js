import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const initDb = async () => {
  try {
    const client = await pool.connect();
    const schemaSql = fs.readFileSync(path.resolve(__dirname, 'init.sql')).toString();
    await client.query(schemaSql);
    console.log('Database schema initialized successfully.');
    client.release();
  } catch (err) {
    console.error('Error initializing database schema:', err);
  }
};

initDb();
