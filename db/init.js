const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false
});

// Convert ? to $1, $2, etc for PostgreSQL compatibility
function convertQuery(sql) {
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
}

pool.getAsync = async (sql, params = []) => {
  const res = await pool.query(convertQuery(sql), params);
  return res.rows[0];
};

pool.allAsync = async (sql, params = []) => {
  const res = await pool.query(convertQuery(sql), params);
  return res.rows;
};

pool.runAsync = async (sql, params = []) => {
  return await pool.query(convertQuery(sql), params);
};

pool.initTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK(role IN ('KARYAWAN','FINANCE','MANAGER','AUDITOR','ADMIN')),
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS petty_cash_funds (
      id SERIAL PRIMARY KEY,
      amount NUMERIC(15,2) NOT NULL,
      description TEXT,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS reimbursement_requests (
      id SERIAL PRIMARY KEY,
      requester_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(15,2) NOT NULL,
      receipt_image_path TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      reviewed_by INTEGER,
      reviewed_at TIMESTAMP,
      rejection_note TEXT,
      request_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    )`);

    // Table for express-session (connect-pg-simple)
    await client.query(`CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main !== module) {
  // auto-init disabled because Vercel/Render might run into race conditions if connected to real DB
  // they should run seed.js or manual init once. 
  // However, for development convenience, we can try to init tables safely.
  pool.initTables().catch(err => console.error('DB init error:', err));
}

module.exports = pool;
