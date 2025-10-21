const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  try {
    console.log("🔄 Starting callback_data column migration...");

    // Read the migration SQL file
    const migrationPath = path.join(
      __dirname,
      "db",
      "add_callback_data_column.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Execute the migration
    const result = await pool.query(migrationSQL);

    console.log("✅ Migration completed successfully!");
    console.log("📊 Verification results:", result.rows);

    // Test the column exists by doing a simple query
    const testQuery = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'callback_data'
    `);

    console.log("🧪 Test query result:", testQuery.rows);
    console.log("✅ callback_data column is now available!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log("🎉 Migration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration script failed:", error);
    process.exit(1);
  });
