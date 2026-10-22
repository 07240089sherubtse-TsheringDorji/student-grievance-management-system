
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// 1. Validate required database environment variables
const requiredVariables = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
];

const missingVariables = requiredVariables.filter(
  (key) =>
    typeof process.env[key] !== 'string' ||
    process.env[key].trim() === ''
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing or empty database environment variables: ${missingVariables.join(', ')}`
  );
}

// 2. Configure PostgreSQL connection for Neon
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000
});

// 3. Log database connection errors without exposing credentials
pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

// 4. Initialize database tables and default data
async function initializeDatabase() {
  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'student',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      category_id SERIAL PRIMARY KEY,
      category_name VARCHAR(80) UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS departments (
      department_id SERIAL PRIMARY KEY,
      department_name VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grievances (
      grievance_id SERIAL PRIMARY KEY,
      reference_id VARCHAR(30) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      category_id INTEGER NOT NULL REFERENCES categories(category_id),
      department_id INTEGER REFERENCES departments(department_id),
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED'
        CHECK (
          status IN (
            'SUBMITTED',
            'UNDER REVIEW',
            'ASSIGNED',
            'IN PROGRESS',
            'RESOLVED',
            'CLOSED'
          )
        ),
      admin_response TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grievance_updates (
      update_id SERIAL PRIMARY KEY,
      grievance_id INTEGER NOT NULL
        REFERENCES grievances(grievance_id) ON DELETE CASCADE,
      updated_by INTEGER REFERENCES users(user_id),
      status VARCHAR(30),
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      grievance_id INTEGER REFERENCES grievances(grievance_id),
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Update existing users table and create indexes
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS department_id INTEGER
      REFERENCES departments(department_id) ON DELETE SET NULL;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS must_change_password
      BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check;

    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('student', 'department', 'admin'));

    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_department_role_check;

    ALTER TABLE users
      ADD CONSTRAINT users_department_role_check
      CHECK (role <> 'department' OR department_id IS NOT NULL);

    CREATE INDEX IF NOT EXISTS idx_grievances_department
      ON grievances(department_id);

    CREATE INDEX IF NOT EXISTS idx_grievances_user
      ON grievances(user_id);
  `);

  // Insert default grievance categories
  const categories = [
    ['Academic', 'Teaching, course or academic concerns'],
    ['Facilities', 'Classrooms, hostels and campus facilities'],
    ['Examination', 'Examination, marks or assessment concerns'],
    ['Library', 'Library services and resources'],
    ['Administration', 'Administrative services and processes']
  ];

  for (const [name, description] of categories) {
    await pool.query(
      `INSERT INTO categories (category_name, description)
       VALUES ($1, $2)
       ON CONFLICT (category_name) DO NOTHING`,
      [name, description]
    );
  }

  // Insert default departments
  const departments = [
    'Academic Affairs',
    'Facilities and Maintenance',
    'Examination Office',
    'Library',
    'Student Administration'
  ];

  for (const name of departments) {
    await pool.query(
      `INSERT INTO departments (department_name)
       VALUES ($1)
       ON CONFLICT (department_name) DO NOTHING`,
      [name]
    );
  }

  // Create the initial administrator if one does not exist
  const email = (
    process.env.ADMIN_EMAIL || 'admin@grievance.local'
  ).toLowerCase();

  const existing = await pool.query(
    'SELECT user_id FROM users WHERE email = $1',
    [email]
  );

  if (existing.rowCount === 0) {
    const adminPassword =
      process.env.ADMIN_PASSWORD || 'Admin@12345';

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await pool.query(
      `INSERT INTO users
        (name, email, password, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'System Administrator',
        email,
        hashedPassword,
        'admin',
        !process.env.ADMIN_PASSWORD
      ]
    );

    console.log('Initial administrator account created.');
  }

  console.log('Database tables and default data initialized successfully.');
}

// 5. Export the pool and initialization function
module.exports = {
  pool,
  initializeDatabase
};
