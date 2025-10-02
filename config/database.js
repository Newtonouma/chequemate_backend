import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    database: process.env.DB_NAME || "chequemate",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "9530",
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false,
    } : false
});

export default pool;
