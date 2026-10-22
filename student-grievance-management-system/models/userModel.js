const { pool } = require('../config/db');

const SAFE = 'u.user_id, u.name, u.email, u.role, u.department_id, u.is_active, u.must_change_password, u.created_at, d.department_name';

module.exports = {
  async create({ name, email, password, role = 'student', departmentId = null, mustChange = false }) {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, department_id, must_change_password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, name, email, role, department_id',
      [name, email, password, role, departmentId, mustChange]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [id]
    );
    return result.rows[0];
  },

  async listAll() {
    const result = await pool.query(
      `SELECT ${SAFE} FROM users u LEFT JOIN departments d USING (department_id) ORDER BY u.role, u.name`
    );
    return result.rows;
  },

  async setActive(id, active) {
    const result = await pool.query(
      'UPDATE users SET is_active = $1 WHERE user_id = $2 RETURNING user_id',
      [active, id]
    );
    return result.rows[0];
  },

  async setPassword(id, hash, mustChange = false) {
    await pool.query(
      'UPDATE users SET password = $1, must_change_password = $2 WHERE user_id = $3',
      [hash, mustChange, id]
    );
  },

  async departmentUserIds(departmentId) {
    const result = await pool.query(
      "SELECT user_id FROM users WHERE role = 'department' AND department_id = $1 AND is_active",
      [departmentId]
    );
    return result.rows.map(row => row.user_id);
  },

  async countActiveAdmins() {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active"
    );
    return result.rows[0].n;
  }
};