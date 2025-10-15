import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  database: process.env.DB_NAME || "chequemate",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "9530",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl:
    process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : false,
  // Add connection resilience
  max: 20, // Increased from 10 to handle more concurrent users
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  acquireTimeoutMillis: 60000,
});

// Add connection error handling
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export default pool;
