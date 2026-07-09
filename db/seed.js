const db = require('./init');
const bcrypt = require('bcryptjs');

async function seed() {
  // Ensure tables exist with latest schema before inserting
  await db.initTables();

  // Clear existing data
  await db.runAsync('TRUNCATE TABLE reimbursement_requests, petty_cash_funds, users, categories RESTART IDENTITY CASCADE');

  // Seed categories
  const cats = [
    ['ATK', 'Alat Tulis Kantor (kertas, pulpen, tinta, dll.)'],
    ['Konsumsi', 'Makanan, minuman, dan snack rapat'],
    ['Transportasi', 'Ongkos kirim, bensin, parkir, dan ojek'],
    ['Perlengkapan', 'Peralatan umum operasional kantor'],
    ['Lain-lain', 'Pengeluaran di luar kategori yang tersedia'],
  ];
  for (const [name, desc] of cats) {
    await db.runAsync('INSERT INTO categories (name, description) VALUES (?, ?)', [name, desc]);
  }

  // Seed users
  const users = [
    ['Budi Santoso', 'budi@pettycash.test', bcrypt.hashSync('karyawan123', 10), 'KARYAWAN'],
    ['Dewi Rahayu', 'dewi@pettycash.test', bcrypt.hashSync('karyawan123', 10), 'KARYAWAN'],
    ['Siti Aminah', 'siti.finance@pettycash.test', bcrypt.hashSync('finance123', 10), 'FINANCE'],
    ['Ahmad Kasir', 'ahmad.finance@pettycash.test', bcrypt.hashSync('finance123', 10), 'FINANCE'],
    ['Eko Prabowo', 'eko.manager@pettycash.test', bcrypt.hashSync('manager123', 10), 'MANAGER'],
    ['Vanesa', 'vanesa.auditor@pettycash.test', bcrypt.hashSync('auditor123', 10), 'AUDITOR'],
    ['Root Admin', 'admin@pettycash.test', bcrypt.hashSync('admin@123!', 10), 'ADMIN'],
  ];
  for (const [name, email, password, role] of users) {
    await db.runAsync('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, password, role]);
  }

  // Initial top-up
  const finance = await db.getAsync("SELECT id FROM users WHERE role = 'FINANCE' LIMIT 1");
  await db.runAsync('INSERT INTO petty_cash_funds (amount, description, created_by) VALUES (?, ?, ?)',
    [5000000, 'Dana Awal Kas Kecil - Juli 2026', finance.id]);

  // Sample requests
  const karyawan = await db.getAsync("SELECT id FROM users WHERE role = 'KARYAWAN' LIMIT 1");
  const cat = await db.getAsync('SELECT id FROM categories LIMIT 1');
  const sql = `INSERT INTO reimbursement_requests (requester_id, category_id, description, amount, receipt_image_path, status, request_date) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  await db.runAsync(sql, [karyawan.id, cat.id, 'Pembelian ATK kantor bulan Juli', 150000, 'sample/sample.png', 'PENDING', '2026-07-09']);
  await db.runAsync(sql, [karyawan.id, 2, 'Konsumsi rapat mingguan divisi', 250000, 'sample/sample.png', 'APPROVED', '2026-07-07']);
  await db.runAsync(sql, [karyawan.id, 3, 'Ongkos kirim dokumen ke kantor pusat', 50000, 'sample/sample.png', 'REJECTED', '2026-07-05']);

  // Update approved request reviewer
  const finance2 = await db.getAsync("SELECT id FROM users WHERE role = 'FINANCE' LIMIT 1");
  await db.runAsync(`UPDATE reimbursement_requests SET reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE status='APPROVED'`, [finance2.id]);
  await db.runAsync(`UPDATE reimbursement_requests SET reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP, rejection_note='Dana melebihi batas harian.' WHERE status='REJECTED'`, [finance2.id]);

  console.log('\n✅ Database berhasil di-seed!\n');
  console.log('🔐 Akun untuk testing:');
  console.log('  👤 Karyawan : budi@pettycash.test          / karyawan123');
  console.log('  👤 Karyawan : dewi@pettycash.test          / karyawan123');
  console.log('  💳 Finance  : siti.finance@pettycash.test  / finance123');
  console.log('  💳 Finance  : ahmad.finance@pettycash.test / finance123');
  console.log('  📊 Manager  : eko.manager@pettycash.test   / manager123');
  console.log('  🔍 Auditor  : vanesa.auditor@pettycash.test  / auditor123');
  console.log('  ⚙️  Admin   : admin@pettycash.test         / admin@123!\n');
  process.exit(0);
}

seed().catch(err => { console.error('Seed error:', err); process.exit(1); });
