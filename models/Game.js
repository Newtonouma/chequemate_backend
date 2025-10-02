import pool from '../config/database.js';

class Game {
  static async create(gameData) {
    const {
      challengeId,
      result
    } = gameData;

    const query = `
      INSERT INTO games (
        challenge_id,
        result,
        created_at
      )
      VALUES ($1, $2, NOW())
      RETURNING *;
    `;

    const values = [challengeId, result];

    try {
      const queryResult = await pool.query(query, values);
      return queryResult.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findById(gameId) {
    const query = `
      SELECT * FROM games WHERE id = $1;
    `;
    
    try {
      const result = await pool.query(query, [gameId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findByChallengeId(challengeId) {
    const query = `
      SELECT * FROM games WHERE challenge_id = $1;
    `;
    
    try {
      const result = await pool.query(query, [challengeId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

export default Game;
