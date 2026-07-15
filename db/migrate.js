require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Menjalankan migrasi...');
    
    // Drop old CHECK constraint and add new one with PAID status
    await client.query(`ALTER TABLE reimbursement_requests DROP CONSTRAINT IF EXISTS reimbursement_requests_status_check`);
    await client.query(`ALTER TABLE reimbursement_requests ADD CONSTRAINT reimbursement_requests_status_check CHECK(status IN ('PENDING','APPROVED','REJECTED','PAID'))`);
    
    // Add payment columns
    await client.query(`ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
    await client.query(`ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS payment_proof TEXT`);
    
    console.log('✅ Migrasi berhasil!');
    console.log('  - Status PAID ditambahkan');
    console.log('  - Kolom paid_by, paid_at, payment_proof ditambahkan');
  } catch (err) {
    console.error('❌ Migrasi gagal:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
