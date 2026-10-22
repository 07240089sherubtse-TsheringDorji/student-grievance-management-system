const { pool } = require('../config/db');

module.exports = {
  async categories() {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY category_name'
    );
    return result.rows;
  },

  async departments() {
    const result = await pool.query(
      'SELECT * FROM departments ORDER BY department_name'
    );
    return result.rows;
  },

  async listForStudent(userId) {
    const result = await pool.query(
      `SELECT g.*, c.category_name, d.department_name
       FROM grievances g
       JOIN categories c USING (category_id)
       LEFT JOIN departments d USING (department_id)
       WHERE g.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async listForDepartment(departmentId, search = '', status = '') {
    const result = await pool.query(
      `SELECT g.*, c.category_name, d.department_name, u.name AS student_name, u.email AS student_email
       FROM grievances g
       JOIN categories c USING (category_id)
       LEFT JOIN departments d USING (department_id)
       JOIN users u ON u.user_id = g.user_id
       WHERE g.department_id = $1
         AND ($2 = '' OR g.title ILIKE '%' || $2 || '%' OR g.reference_id ILIKE '%' || $2 || '%')
         AND ($3 = '' OR g.status = $3)
       ORDER BY g.created_at DESC`,
      [departmentId, search, status]
    );
    return result.rows;
  },

  async deptStats(departmentId) {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('ASSIGNED', 'UNDER REVIEW', 'SUBMITTED'))::int AS pending,
         COUNT(*) FILTER (WHERE status = 'IN PROGRESS')::int AS in_progress,
         COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED'))::int AS done
       FROM grievances
       WHERE department_id = $1`,
      [departmentId]
    );
    return result.rows[0];
  },

  async createDepartment(name) {
    const result = await pool.query(
      'INSERT INTO departments (department_name) VALUES ($1) RETURNING *',
      [name]
    );
    return result.rows[0];
  },

  async renameDepartment(id, name) {
    const result = await pool.query(
      'UPDATE departments SET department_name = $1 WHERE department_id = $2 RETURNING *',
      [name, id]
    );
    return result.rows[0];
  },

  async departmentsWithCounts() {
    const result = await pool.query(
      `SELECT d.*,
         (SELECT COUNT(*)::int FROM users u WHERE u.department_id = d.department_id AND u.role = 'department') AS staff_count,
         (SELECT COUNT(*)::int FROM grievances g WHERE g.department_id = d.department_id) AS grievance_count
       FROM departments d
       ORDER BY d.department_name`
    );
    return result.rows;
  },

  async listAll(search = '', status = '') {
    const result = await pool.query(
      `SELECT g.*, c.category_name, d.department_name, u.name AS student_name, u.email AS student_email
       FROM grievances g
       JOIN categories c USING (category_id)
       LEFT JOIN departments d USING (department_id)
       JOIN users u ON u.user_id = g.user_id
       WHERE ($1 = '' OR g.title ILIKE '%' || $1 || '%' OR g.reference_id ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
         AND ($2 = '' OR g.status = $2)
       ORDER BY g.created_at DESC`,
      [search, status]
    );
    return result.rows;
  },

  async get(id) {
    const result = await pool.query(
      `SELECT g.*, c.category_name, d.department_name, u.name AS student_name, u.email AS student_email
       FROM grievances g
       JOIN categories c USING (category_id)
       LEFT JOIN departments d USING (department_id)
       JOIN users u ON u.user_id = g.user_id
       WHERE g.grievance_id = $1`,
      [id]
    );
    return result.rows[0];
  },

  async create({ referenceId, userId, categoryId, title, description }) {
    const result = await pool.query(
      `INSERT INTO grievances (reference_id, user_id, category_id, title, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [referenceId, userId, categoryId, title, description]
    );
    return result.rows[0];
  },

  async history(id) {
    const result = await pool.query(
      `SELECT gu.*, u.name AS updated_by_name
       FROM grievance_updates gu
       LEFT JOIN users u ON u.user_id = gu.updated_by
       WHERE grievance_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    return result.rows;
  },

  async addHistory(id, userId, status, comment) {
    await pool.query(
      'INSERT INTO grievance_updates (grievance_id, updated_by, status, comment) VALUES ($1, $2, $3, $4)',
      [id, userId, status, comment]
    );
  },

  async updateStatus(id, userId, status, comment) {
    const result = await pool.query(
      'UPDATE grievances SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE grievance_id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount) {
      await this.addHistory(id, userId, status, comment || `Status changed to ${status}`);
    }
    return result.rows[0];
  },

  async assign(id, userId, departmentId) {
    const result = await pool.query(
      `UPDATE grievances
       SET department_id = $1,
           status = CASE WHEN status IN ('SUBMITTED', 'UNDER REVIEW') THEN 'ASSIGNED' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE grievance_id = $2
       RETURNING *`,
      [departmentId, id]
    );
    if (result.rowCount) {
      await this.addHistory(id, userId, result.rows[0].status, 'Assigned to department');
    }
    return result.rows[0];
  },

  async respond(id, userId, response) {
    const result = await pool.query(
      'UPDATE grievances SET admin_response = $1, updated_at = CURRENT_TIMESTAMP WHERE grievance_id = $2 RETURNING *',
      [response, id]
    );
    if (result.rowCount) {
      await this.addHistory(id, userId, result.rows[0].status, `Response: ${response}`);
    }
    return result.rows[0];
  },

  async stats() {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('SUBMITTED', 'UNDER REVIEW'))::int AS pending,
         COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
         COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed
       FROM grievances`
    );
    return result.rows[0];
  },

  async notifications(userId) {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    return result.rows;
  }
};