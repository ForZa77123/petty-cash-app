const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

// Upload bukti pembayaran (Base64 in DB, Vercel-compatible)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|pdf/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Hanya file JPG, PNG, atau PDF yang diperbolehkan.'));
  },
});

async function getBalance() {
  const resIn = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds`);
  const resOut = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='PAID'`);
  const totalIn = parseFloat(resIn.totalIn || 0);
  const totalOut = parseFloat(resOut.totalOut || 0);
  return { totalIn, totalOut, balance: totalIn - totalOut };
}

// Dashboard Finance — tampil pengajuan APPROVED (sudah ok Manager, belum dibayar)
router.get('/dashboard', hasRole('FINANCE'), async (req, res) => {
  try {
    const { totalIn, totalOut, balance } = await getBalance();
    const toPayRequests = await db.allAsync(
      `SELECT r.*, c.name AS category_name, u.name AS requester_name, m.name AS manager_name
       FROM reimbursement_requests r
       JOIN categories c ON r.category_id=c.id
       JOIN users u ON r.requester_id=u.id
       LEFT JOIN users m ON r.reviewed_by=m.id
       WHERE r.status='APPROVED' ORDER BY r.reviewed_at ASC`
    );
    const recentPaid = await db.allAsync(
      `SELECT r.*, c.name AS category_name, u.name AS requester_name
       FROM reimbursement_requests r
       JOIN categories c ON r.category_id=c.id
       JOIN users u ON r.requester_id=u.id
       WHERE r.status='PAID' ORDER BY r.paid_at DESC LIMIT 10`
    );
    res.render('finance/dashboard', {
      user: req.session.user, balance, totalIn, totalOut,
      toPayRequests, recentPaid,
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (e) { console.error(e); res.redirect('/login'); }
});

// Daftar semua pengajuan
router.get('/pengajuan', hasRole('FINANCE'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT r.*, c.name AS category_name, u.name AS requester_name, m.name AS manager_name
               FROM reimbursement_requests r
               JOIN categories c ON r.category_id=c.id
               JOIN users u ON r.requester_id=u.id
               LEFT JOIN users m ON r.reviewed_by=m.id`;
    const params = [];
    if (status && ['PENDING','APPROVED','REJECTED','PAID'].includes(status)) {
      sql += ' WHERE r.status = ?'; params.push(status);
    }
    sql += ' ORDER BY r.created_at DESC';
    const requests = await db.allAsync(sql, params);
    res.render('finance/pengajuan', {
      user: req.session.user, requests,
      currentStatus: status || 'ALL',
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (e) { console.error(e); res.redirect('/finance/dashboard'); }
});

// Detail pengajuan
router.get('/pengajuan/:id', hasRole('FINANCE'), async (req, res) => {
  try {
    const request = await db.getAsync(
      `SELECT r.*, c.name AS category_name, u.name AS requester_name,
              m.name AS manager_name, m.role AS reviewer_role, p.name AS payer_name
       FROM reimbursement_requests r
       JOIN categories c ON r.category_id=c.id
       JOIN users u ON r.requester_id=u.id
       LEFT JOIN users m ON r.reviewed_by=m.id
       LEFT JOIN users p ON r.paid_by=p.id
       WHERE r.id=?`,
      [req.params.id]
    );
    if (!request) { req.flash('error', 'Pengajuan tidak ditemukan.'); return res.redirect('/finance/pengajuan'); }
    res.render('finance/detail', { user: req.session.user, request, flash: { error: req.flash('error'), success: req.flash('success') } });
  } catch (e) { console.error(e); res.redirect('/finance/pengajuan'); }
});

// Proses Pembayaran (APPROVED → PAID)
router.post('/pengajuan/:id/pay', hasRole('FINANCE'), upload.single('payment_proof'), async (req, res) => {
  try {
    const { balance } = await getBalance();
    const request = await db.getAsync(`SELECT * FROM reimbursement_requests WHERE id=? AND status='APPROVED'`, [req.params.id]);
    if (!request) {
      req.flash('error', 'Pengajuan tidak ditemukan atau belum disetujui Manager.');
      return res.redirect(`/finance/pengajuan/${req.params.id}`);
    }
    if (request.amount > balance) {
      req.flash('error', `Saldo tidak mencukupi. Saldo saat ini: Rp ${balance.toLocaleString('id-ID')}`);
      return res.redirect(`/finance/pengajuan/${req.params.id}`);
    }
    const paymentProof = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      : null;
    await db.runAsync(
      `UPDATE reimbursement_requests SET status='PAID', paid_by=?, paid_at=CURRENT_TIMESTAMP, payment_proof=? WHERE id=?`,
      [req.session.user.id, paymentProof, req.params.id]
    );
    req.flash('success', 'Pembayaran berhasil diproses dan dicatat.');
    res.redirect('/finance/pengajuan');
  } catch (e) { console.error(e); req.flash('error', 'Terjadi kesalahan saat memproses pembayaran.'); res.redirect(`/finance/pengajuan/${req.params.id}`); }
});

// Saldo & Top-Up
router.get('/saldo', hasRole('FINANCE'), async (req, res) => {
  try {
    const { totalIn, totalOut, balance } = await getBalance();
    const topUps = await db.allAsync('SELECT f.*, u.name AS creator_name FROM petty_cash_funds f JOIN users u ON f.created_by=u.id ORDER BY f.created_at DESC');
    const paidRequests = await db.allAsync(
      `SELECT r.*, u.name AS requester_name, c.name AS category_name, p.name AS payer_name
       FROM reimbursement_requests r
       JOIN users u ON r.requester_id=u.id
       JOIN categories c ON r.category_id=c.id
       LEFT JOIN users p ON r.paid_by=p.id
       WHERE r.status='PAID' ORDER BY r.paid_at DESC`
    );
    res.render('finance/saldo', { user: req.session.user, balance, totalIn, totalOut, topUps, paidRequests, flash: { error: req.flash('error'), success: req.flash('success') } });
  } catch (e) { console.error(e); res.redirect('/finance/dashboard'); }
});

router.post('/topup', hasRole('FINANCE'), async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || parseFloat(amount) <= 0) { req.flash('error', 'Jumlah top-up tidak valid.'); return res.redirect('/finance/saldo'); }
    await db.runAsync('INSERT INTO petty_cash_funds (amount, description, created_by) VALUES (?, ?, ?)',
      [parseFloat(amount), description || 'Pengisian Dana Kas Kecil', req.session.user.id]);
    req.flash('success', `Dana berhasil ditambahkan sebesar Rp ${parseFloat(amount).toLocaleString('id-ID')}.`);
    res.redirect('/finance/saldo');
  } catch (e) { console.error(e); res.redirect('/finance/saldo'); }
});

module.exports = router;
