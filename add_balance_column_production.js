import pool from "./config/database.js";

async function addBalanceColumn() {
  const client = await pool.connect();

  try {
    console.log(
      "🔧 Manually adding balance column to production database...\n"
    );

    // Step 1: Add balance column
    console.log("1️⃣ Adding balance column...");
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 0.00;
    `);
    console.log("✅ Balance column added\n");

    // Step 2: Update existing users
    console.log("2️⃣ Setting default balance for existing users...");
    const updateResult = await client.query(`
      UPDATE users 
      SET balance = 0.00 
      WHERE balance IS NULL;
    `);
    console.log(`✅ Updated ${updateResult.rowCount} users\n`);

    // Step 3: Add check constraint
    console.log("3️⃣ Adding positive balance constraint...");
    try {
      await client.query(`
        ALTER TABLE users 
        ADD CONSTRAINT positive_balance CHECK (balance >= 0);
      `);
      console.log("✅ Constraint added\n");
    } catch (err) {
      if (err.message.includes("already exists")) {
        console.log("ℹ️  Constraint already exists (safe to ignore)\n");
      } else {
        throw err;
      }
    }

    // Step 4: Create index
    console.log("4️⃣ Creating index on balance column...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance);
    `);
    console.log("✅ Index created\n");

    // Step 5: Verify
    console.log("5️⃣ Verifying column exists...");
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'balance';
    `);

    if (verifyResult.rows.length > 0) {
      console.log("✅ Verification successful!");
      console.log(JSON.stringify(verifyResult.rows[0], null, 2));
    } else {
      console.log("❌ Verification failed - column not found!");
    }

    // Step 6: Count users with balance
    const countResult = await client.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(balance) as users_with_balance
      FROM users;
    `);

    console.log("\n📊 User Statistics:");
    console.log(`  Total users: ${countResult.rows[0].total_users}`);
    console.log(
      `  Users with balance: ${countResult.rows[0].users_with_balance}`
    );

    console.log("\n✅ Balance column migration completed successfully!");
    console.log("🚀 Ready to process refunds");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

addBalanceColumn();
