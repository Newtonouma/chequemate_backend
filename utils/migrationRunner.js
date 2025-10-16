// Automatic database migration runner
// Runs all pending migrations on application startup
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationRunner {
  constructor() {
    this.migrationsDir = path.join(__dirname, "../db");
    this.migrations = [
      "add_balance_column_migration.sql",
      "add_performance_indexes_migration.sql",
      "add_updated_at_column_migration.sql",
      "add_transaction_types_migration.sql",
    ];
  }

  async ensureMigrationsTable() {
    try {
      // Create migrations tracking table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log("✅ [MIGRATION] Migrations table ready");
    } catch (error) {
      console.error(
        "❌ [MIGRATION] Error creating migrations table:",
        error.message
      );
      throw error;
    }
  }

  async isMigrationApplied(migrationName) {
    try {
      const result = await pool.query(
        "SELECT * FROM schema_migrations WHERE migration_name = $1",
        [migrationName]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(
        "❌ [MIGRATION] Error checking migration status:",
        error.message
      );
      return false;
    }
  }

  async markMigrationApplied(migrationName) {
    try {
      await pool.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
        [migrationName]
      );
      console.log(`✅ [MIGRATION] Marked ${migrationName} as applied`);
    } catch (error) {
      console.error("❌ [MIGRATION] Error marking migration:", error.message);
    }
  }

  async runMigration(migrationFile) {
    const migrationPath = path.join(this.migrationsDir, migrationFile);

    try {
      // Check if already applied
      const isApplied = await this.isMigrationApplied(migrationFile);
      if (isApplied) {
        console.log(
          `⏭️  [MIGRATION] Skipping ${migrationFile} (already applied)`
        );
        return;
      }

      // Check if file exists
      if (!fs.existsSync(migrationPath)) {
        console.warn(
          `⚠️  [MIGRATION] Migration file not found: ${migrationFile}`
        );
        return;
      }

      console.log(`🔄 [MIGRATION] Running ${migrationFile}...`);

      // Read SQL file
      const sql = fs.readFileSync(migrationPath, "utf8");

      // Split by semicolon and filter out empty statements
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(
          (s) =>
            s.length > 0 &&
            !s.startsWith("--") &&
            !s.toLowerCase().startsWith("comment")
        );

      // Execute each statement
      for (const statement of statements) {
        // Skip comment-only lines and empty statements
        if (
          statement.trim().startsWith("--") ||
          statement.trim().length === 0
        ) {
          continue;
        }

        // Skip SELECT statements used for verification
        if (
          statement.trim().toLowerCase().startsWith("select") &&
          !statement.trim().toLowerCase().includes("create") &&
          !statement.trim().toLowerCase().includes("alter")
        ) {
          console.log(
            `📊 [MIGRATION] Skipping verification query: ${statement.substring(
              0,
              50
            )}...`
          );
          continue;
        }

        try {
          await pool.query(statement);
        } catch (error) {
          // Only ignore truly safe errors (object already exists)
          const isSafeError =
            error.code === "42P07" || // relation already exists
            error.code === "42710" || // object already exists
            error.code === "42701" || // column already exists
            error.code === "23505" || // unique violation
            (error.message &&
              (error.message.includes("already exists") ||
                error.message.includes("duplicate key")));

          if (isSafeError) {
            console.log(
              `ℹ️  [MIGRATION] Safe to ignore - object already exists: ${error.message.substring(
                0,
                80
              )}...`
            );
            continue;
          }

          // ALL other errors should fail the migration
          console.error(
            `❌ [MIGRATION] Statement failed: ${statement.substring(0, 100)}...`
          );
          throw error;
        }
      }

      // Mark as applied ONLY after all statements succeed
      await this.markMigrationApplied(migrationFile);
      console.log(`✅ [MIGRATION] Successfully applied ${migrationFile}`);
    } catch (error) {
      console.error(`❌ [MIGRATION] FAILED: ${migrationFile}`);
      console.error(`❌ [MIGRATION] Error: ${error.message}`);
      console.error(`❌ [MIGRATION] Stack: ${error.stack}`);
      // CRITICAL: Re-throw to prevent marking as applied and stop app startup
      throw error;
    }
  }

  async runAll() {
    console.log("🚀 [MIGRATION] Starting database migrations...");

    try {
      // Ensure migrations tracking table exists
      await this.ensureMigrationsTable();

      // Run each migration in order
      for (const migration of this.migrations) {
        await this.runMigration(migration);
      }

      console.log("✅ [MIGRATION] All migrations completed successfully");
      return true;
    } catch (error) {
      console.error("❌ [MIGRATION] CRITICAL FAILURE:", error.message);
      console.error("❌ [MIGRATION] Stack:", error.stack);
      console.error(
        "🚨 [MIGRATION] Cannot start application with failed migrations!"
      );
      console.error(
        "🔧 [MIGRATION] Please fix the migration and restart the application."
      );

      // CRITICAL: Re-throw to stop application startup
      // This prevents the app from running with an incomplete database schema
      throw new Error(`Migration failed: ${error.message}`);
    }
  }

  async getStatus() {
    try {
      const result = await pool.query(
        "SELECT migration_name, applied_at FROM schema_migrations ORDER BY applied_at DESC"
      );
      return {
        appliedMigrations: result.rows,
        totalMigrations: this.migrations.length,
        pendingMigrations: this.migrations.filter(
          (m) => !result.rows.some((r) => r.migration_name === m)
        ),
      };
    } catch (error) {
      console.error("❌ [MIGRATION] Error getting status:", error.message);
      return {
        appliedMigrations: [],
        totalMigrations: this.migrations.length,
        pendingMigrations: this.migrations,
      };
    }
  }
}

const migrationRunner = new MigrationRunner();
export default migrationRunner;
