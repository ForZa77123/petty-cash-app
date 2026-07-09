const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

async function getBalance() {
  const { totalIn } = await db.getAsync('SELECT COALESCE(SUM(amount),0) AS totalIn FROM petty_cash_funds');
  const { totalOut } = await db.getAsync("SELECT COALESCE(SUM(amount),0) AS totalOut FROM reimbursement_requests WHERE status='APPROVED'");
  return { totalIn, totalOut, balance: totalIn - totalOut };
}

router.get('/dashboard', hasRole('FINANCE'), async (req, res) => {
  try {
    const { totalIn, totalOut, balance } = await getBalance();
    const pendingRequests = await db.allAsync(
      "SELECT r.*, c.name AS category_name, u.name AS requester_name FROM reimbursement_requests r JOIN categories c ON r.category_id=c.id JOIN users u ON r.requester_id=u.id WHERE r.status='PENDING' ORDER BY r.created_at ASC"
    );
    const allRequests = await db.allAsync(
      'SELECT r.*, c.name AS category_name, u.name AS requester_name FROM reimbursement_requests r JOIN categories c ON r.category_id=c.id JOIN users u ON r.requester_id=u.id ORDER BY r.created_at DESC LIMIT 10'
    );
    res.render('finance/dashboard', { user: req.session.user, balance, totalIn, totalOut, pendingRequests, allRequests, flash: { error: req.flash('error'), success: req.flash('success') } });
  } catch (e) { console.error(e); res.redirect('/login'); }
});

router.get('/pengajuan', hasRole('FINANCE'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT r.*, c.name AS category_name, u.name AS requester_name FROM reimbursement_requests r JOIN categories c ON r.category_id=c.id JOIN users u ON r.requester_id=u.id';
    const params = [];
    if (status && ['PENDING','APPROVED','REJECTED'].includes(status)) { sql += ' WHERE r.status = ?'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC';
    const requests = await db.allAsync(sql, params);
    res.render('finance/pengajuan', { user: req.session.user, requests, currentStatus: status || 'ALL', flash: { error: req.flash('error'), success: req.flash('success') } });
  } catch (e) { console.error(e); res.redirect('/finance/dashboard'); }
});

router.get('/pengajuan/:id', hasRole('FINANCE'), async (req, res) => {
  const request = await db.getAsync(
    'SELECT r.*, c.name AS category_name, u.name AS requester_name, rv.name AS reviewer_name FROM reimbursement_requests r JOIN categories c ON r.category_id=c.id JOIN users u ON r.requester_id=u.id LEFT JOIN users rv ON r.reviewed_by=rv.id WHERE r.id=?',
    [req.params.id]
  );
  if (!request) { req.flash('error', 'Pengajuan tidak ditemukan.'); return res.redirect('/finance/pengajuan'); }
  res.render('finance/detail', { user: req.session.user, request, flash: { error: req.flash('error'), success: req.flash('success') } });
});

router.post('/pengajuan/:id/approve', hasRole('FINANCE'), async (req, res) => {
  try {
    const { balance } = await getBalance();
    const request = await db.getAsync("SELECT * FROM reimbursement_requests WHERE id=? AND status='PENDING'", [req.params.id]);
    if (!request) { req.flash('error', 'Pengajuan tidak ditemukan atau sudah diproses.'); return res.redirect(`/finance/pengajuan/${req.params.id}`); }
    if (request.amount > balance) { req.flash('error', `Saldo tidak mencukupi. Saldo saat ini: Rp ${balance.toLocaleString('id-ID')}`); return res.redirect(`/finance/pengajuan/${req.params.id}`); }
    await db.runAsync("UPDATE reimbursement_requests SET status='APPROVED', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?", [req.session.user.id, req.params.id]);
    req.flash('success', 'Pengajuan berhasil disetujui.');
    res.redirect('/finance/pengajuan');
  } catch (e) { console.error(e); res.redirect('/finance/pengajuan'); }
});

router.post('/pengajuan/:id/reject', hasRole('FINANCE'), async (req, res) => {
  try {
    const { rejection_note } = req.body;
    const request = await db.getAsync("SELECT * FROM reimbursement_requests WHERE id=? AND status='PENDING'", [req.params.id]);
    if (!request) { req.flash('error', 'Pengajuan tidak ditemukan atau sudah diproses.'); return res.redirect(`/finance/pengajuan/${req.params.id}`); }
    await db.runAsync("UPDATE reimbursement_requests SET status='REJECTED', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP, rejection_note=? WHERE id=?",
      [req.session.user.id, rejection_note || 'Tidak ada keterangan.', req.params.id]);
    req.flash('success', 'Pengajuan berhasil ditolak.');
    res.redirect('/finance/pengajuan');
  } catch (e) { console.error(e); res.redirect('/finance/pengajuan'); }
});

router.get('/saldo', hasRole('FINANCE'), async (req, res) => {
  try {
    const { totalIn, totalOut, balance } = await getBalance();
    const topUps = await db.allAsync('SELECT f.*, u.name AS creator_name FROM petty_cash_funds f JOIN users u ON f.created_by=u.id ORDER BY f.created_at DESC');
    const approvedRequests = await db.allAsync("SELECT r.*, u.name AS requester_name, c.name AS category_name FROM reimbursement_requests r JOIN users u ON r.requester_id=u.id JOIN categories c ON r.category_id=c.id WHERE r.status='APPROVED' ORDER BY r.reviewed_at DESC");
    res.render('finance/saldo', { user: req.session.user, balance, totalIn, totalOut, topUps, approvedRequests, flash: { error: req.flash('error'), success: req.flash('success') } });
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
