const { pool } = require('../config/db');
const SAFE = 'u.user_id,u.name,u.email,u.role,u.department_id,u.is_active,u.must_change_password,u.created_at,d.department_name';
module.exports = {
  async create({ name, email, password, role = 'student', departmentId = null, mustChange = false }) {
    const r = await pool.query(
      'INSERT INTO users(name,email,password,role,department_id,must_change_password) VALUES($1,$2,$3,$4,$5,$6) RETURNING user_id,name,email,role,department_id',
      [name, email, password, role, departmentId, mustChange]);
    return r.rows[0];
  },
  async findByEmail(email) { return (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0]; },
  async findById(id) { return (await pool.query('SELECT * FROM users WHERE user_id=$1', [id])).rows[0]; },
  async listAll() { return (await pool.query(`SELECT ${SAFE} FROM users u LEFT JOIN departments d USING(department_id) ORDER BY u.role, u.name`)).rows; },
  async setActive(id, active) { return (await pool.query('UPDATE users SET is_active=$1 WHERE user_id=$2 RETURNING user_id', [active, id])).rows[0]; },
  async setPassword(id, hash, mustChange = false) { await pool.query('UPDATE users SET password=$1,must_change_password=$2 WHERE user_id=$3', [hash, mustChange, id]); },
  async departmentUserIds(departmentId) {
    return (await pool.query("SELECT user_id FROM users WHERE role='department' AND department_id=$1 AND is_active", [departmentId])).rows.map(r => r.user_id);
  },
  async countActiveAdmins() { return (await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role='admin' AND is_active")).rows[0].n; }
};
