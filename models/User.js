import pool from "../config/database.js"; // PostgreSQL pool
import bcrypt from "bcryptjs";

class User {
  static async create(userData) {
    const {
      email,
      password, // This password should already be plain text here, hashed below
      username,
      name,
      phone,
      chessComUsername,
      lichessUsername,
      preferredPlatform,
    } = userData;

    console.log(userData);

    // Hash the password - This part is correct and crucial for security
    const hashedPassword = await bcrypt.hash(password, 10);

    // PostgreSQL INSERT query with '$' placeholders
    const query = `
            INSERT INTO users (
                email,
                password,
                username,
                name,
                phone,
                chess_com_username,
                lichess_username,
                preferred_platform,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *
        `;

    const values = [
      email,
      hashedPassword,
      username,
      name,
      phone,
      chessComUsername || null, // Handle optional fields
      lichessUsername || null,
      preferredPlatform,
    ];

    console.log(values);

    try {
      // Using pool.query() for PostgreSQL
      const result = await pool.query(query, values);

      // Construct the user object to return from PostgreSQL result
      const newUser = result.rows[0];
      return {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        // You can add other fields from userData if needed by the controller
      };
    } catch (error) {
      console.error("Error in User.create:", error);
      // Re-throw the error so the controller can handle it (e.g., duplicate entry)
      throw error;
    }
  }

  static async findByEmail(email) {
    // PostgreSQL SELECT query with '$' placeholder
    const query = "SELECT * FROM users WHERE email = $1";
    try {
      // Using pool.query() for PostgreSQL
      const result = await pool.query(query, [email]);
      return result.rows[0] || null; // Return the first row found or null if none
    } catch (error) {
      console.error("Error in User.findByEmail:", error);
      throw error;
    }
  }

  static async findByUsername(username) {
    const query = "SELECT * FROM users WHERE username = $1";
    try {
      const result = await pool.query(query, [username]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async updateRatingCache(username, ratingData) {
    const { currentRating } = ratingData;

    // First check if the columns exist to handle production gracefully
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('current_rating', 'last_rating_update')
      `);

      const existingColumns = columnCheck.rows.map((row) => row.column_name);
      const hasCurrentRating = existingColumns.includes("current_rating");
      const hasLastUpdate = existingColumns.includes("last_rating_update");

      if (!hasCurrentRating && !hasLastUpdate) {
        console.log(
          `⚠️  Rating columns missing for ${username}, skipping rating update`
        );
        // Return user data without rating update
        const fallbackQuery = "SELECT * FROM users WHERE username = $1";
        const fallbackResult = await pool.query(fallbackQuery, [username]);
        return fallbackResult.rows[0];
      }

      // Build dynamic query based on available columns
      let setClause = [];
      let params = [username];
      let paramIndex = 2;

      if (hasCurrentRating) {
        setClause.push(`current_rating = $${paramIndex}`);
        params.push(currentRating);
        paramIndex++;
      }

      if (hasLastUpdate) {
        setClause.push(`last_rating_update = NOW()`);
      }

      const query = `
        UPDATE users 
        SET ${setClause.join(", ")}
        WHERE username = $1
        RETURNING *;
      `;

      const result = await pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      console.error(`❌ Error updating rating cache for ${username}:`, error);
      throw error;
    }
  }

  static async findById(id) {
    const query = "SELECT * FROM users WHERE id = $1";
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findAvailableOpponents(preferredPlatform, excludeUserId = null) {
    let query = `
            SELECT id, username, name, chess_com_username, lichess_username, preferred_platform, slogan
            FROM users 
            WHERE preferred_platform = $1
        `;
    const values = [preferredPlatform];

    if (excludeUserId) {
      query += ` AND id != $2`;
      values.push(excludeUserId);
    }

    query += ` ORDER BY created_at DESC`;

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(userId) {
    const query = `SELECT * FROM users WHERE id = $1`;

    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  static async updateProfile(userId, profileData) {
    const {
      name,
      phone,
      chessComUsername,
      lichessUsername,
      preferredPlatform,
    } = profileData;

    const query = `
            UPDATE users 
            SET 
                name = COALESCE($2, name),
                phone = COALESCE($3, phone),
                chess_com_username = COALESCE($4, chess_com_username),
                lichess_username = COALESCE($5, lichess_username),
                preferred_platform = COALESCE($6, preferred_platform),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `;

    try {
      const result = await pool.query(query, [
        userId,
        name,
        phone,
        chessComUsername,
        lichessUsername,
        preferredPlatform,
      ]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async updateBalance(userId, newBalance) {
    const query = `
            UPDATE users 
            SET balance = $2, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1 
            RETURNING *
        `;
    try {
      const result = await pool.query(query, [userId, newBalance]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async getBalance(userId) {
    const query = "SELECT balance FROM users WHERE id = $1";
    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0]?.balance || 0;
    } catch (error) {
      throw error;
    }
  }
}

export default User;
