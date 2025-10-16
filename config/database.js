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
  // ENHANCED CONNECTION POOL for high concurrency
  max: 50, // Increased to 50 for concurrent users
  min: 10, // Keep minimum connections alive
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  acquireTimeoutMillis: 60000,
  // Allow reuse of connections
  allowExitOnIdle: false,
});

// Enhanced connection monitoring
pool.on("error", (err, client) => {
  console.error("❌ [DB_POOL] Unexpected error on idle client:", err.message);
  console.error(err.stack);
});

pool.on("connect", (client) => {
  console.log("✅ [DB_POOL] New client connected");
});

pool.on("acquire", (client) => {
  console.log("🔒 [DB_POOL] Client acquired from pool");
});

pool.on("remove", (client) => {
  console.log("🗑️ [DB_POOL] Client removed from pool");
});

// Log pool metrics every minute in production
if (process.env.NODE_ENV === "production") {
  setInterval(() => {
    console.log(
      `📊 [DB_POOL] Total: ${pool.totalCount} | Idle: ${pool.idleCount} | Waiting: ${pool.waitingCount}`
    );
  }, 60000);
}

export default pool;
