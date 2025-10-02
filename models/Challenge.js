import pool from '../config/database.js';

class Challenge {
  static async create(challengeData) {
    const {
      challenger,
      opponent,
      platform,
      time_control = '10+0',
      rules = 'chess',
      bet_amount = 0,
      payment_status = 'none',
      challenger_phone = null,
      opponent_phone = null
    } = challengeData;

    const query = `
      INSERT INTO challenges (
        challenger,
        opponent,
        platform,
        time_control,
        rules,
        bet_amount,
        payment_status,
        challenger_phone,
        opponent_phone,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
      RETURNING *;
    `;

    const values = [
      challenger,
      opponent,
      platform,
      time_control,
      rules,
      bet_amount,
      payment_status,
      challenger_phone,
      opponent_phone
    ];

    try {
      const result = await pool.query(query, values);
      const row = result.rows[0];
      if (row && row.id === undefined && row._id !== undefined) {
        row.id = row._id;
      }
      return row;
    } catch (error) {
      throw error;
    }
  }

  static async findByUserId(userId) {
    const query = `
      SELECT 
        c.id,
        c.challenger,
        c.opponent,
        c.platform,
        c.time_control,
        c.rules,
        c.status,
        c.created_at,
        challenger_user.username as challenger_username,
        challenger_user.name as challenger_name,
        challenger_user.preferred_platform as challenger_preferred_platform,
        opponent_user.username as opponent_username,
        opponent_user.name as opponent_name,
        opponent_user.preferred_platform as opponent_preferred_platform
      FROM challenges c
      JOIN users challenger_user ON c.challenger = challenger_user.id
      JOIN users opponent_user ON c.opponent = opponent_user.id
      WHERE c.challenger = $1 OR c.opponent = $1
      ORDER BY c.created_at DESC
    `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rows.map(row => {
        // Format to match frontend expectations
        return {
          id: row.id,
          challenger: {
            id: row.challenger,
            username: row.challenger_username,
            name: row.challenger_name,
            preferred_platform: row.challenger_preferred_platform
          },
          opponent: {
            id: row.opponent,
            username: row.opponent_username,
            name: row.opponent_name,
            preferred_platform: row.opponent_preferred_platform
          },
          platform: row.platform,
          time_control: row.time_control,
          rules: row.rules,
          status: row.status,
          created_at: row.created_at
        };
      });
    } catch (error) {
      throw error;
    }
  }

  static async updateStatus(challengeId, status) {
    const query = `
      UPDATE challenges 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    
    try {
      const result = await pool.query(query, [status, challengeId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

export default Challenge;