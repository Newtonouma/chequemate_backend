const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function runMigration() {
  try {
    console.log("🔄 Starting rating columns migration...");

    // Read the migration SQL file
    const migrationPath = path.join(
      __dirname,
      "db",
      "add_rating_columns_migration.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Execute the migration
    const result = await pool.query(migrationSQL);

    console.log("✅ Migration completed successfully!");
    console.log("📊 Verification results:", result.rows);

    // Test the columns exist by doing a simple query
    const testQuery = await pool.query(`
      SELECT current_rating, last_rating_update 
      FROM users 
      LIMIT 1
    `);

    console.log("🧪 Test query successful - columns exist and working");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log("🎉 Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = { runMigration };
