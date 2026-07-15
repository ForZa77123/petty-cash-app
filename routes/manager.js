const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

async function getBalance() {
  const resIn = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds`);
  const resOut = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='PAID'`);
  const totalIn = parseFloat(resIn.totalIn || 0);
  const totalOut = parseFloat(resOut.totalOut || 0);
  return { totalIn, totalOut, balance: totalIn - totalOut };
}

// Dashboard Manager — tampil pengajuan PENDING yang butuh disetujui
router.get('/dashboard', hasRole('MANAGER'), async (req, res) => {
  try {
    const { totalIn, totalOut, balance } = await getBalance();
    const pendingRequests = await db.allAsync(
      `SELECT r.*, c.name AS category_name, u.name AS requester_name
       FROM reimbursement_requests r
       JOIN categories c ON r.category_id=c.id
       JOIN users u ON r.requester_id=u.id
       WHERE r.status='PENDING' ORDER BY r.created_at ASC`
    );
    const recentMutations = await db.allAsync(`
      SELECT 'TOPUP' AS type, f.amount, f.description, f.created_at AS created_at, u.name AS actor
      FROM petty_cash_funds f JOIN users u ON f.created_by=u.id
      UNION ALL
      SELECT 'KELUAR', r.amount, r.description, r.paid_at AS created_at, u.name
      FROM reimbursement_requests r JOIN users u ON r.requester_id=u.id WHERE r.status='PAID'
      ORDER BY created_at DESC LIMIT 10
    `);
    const stats = {
      totalRequests: (await db.getAsync('SELECT COUNT(*) AS c FROM reimbursement_requests')).c,
      approved: (await db.getAsync(`SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='APPROVED'`)).c,
      paid: (await db.getAsync(`SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='PAID'`)).c,
      pending: (await db.getAsync(`SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='PENDING'`)).c,
      rejected: (await db.getAsync(`SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='REJECTED'`)).c,
    };
    res.render('manager/dashboard', {
      user: req.session.user, totalIn, totalOut, balance,
      pendingRequests, recentMutations, stats,
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (e) { console.error(e); res.redirect('/login'); }
});

// Daftar pengajuan untuk Manager
router.get('/pengajuan', hasRole('MANAGER'), async (req, res) => {
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
    res.render('manager/pengajuan', {
      user: req.session.user, requests,
      currentStatus: status || 'ALL',
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (e) { console.error(e); res.redirect('/manager/dashboard'); }
});

// Detail pengajuan
router.get('/pengajuan/:id', hasRole('MANAGER'), async (req, res) => {
  try {
    const request = await db.getAsync(
      `SELECT r.*, c.name AS category_name, u.name AS requester_name,
              m.name AS manager_name, p.name AS payer_name
       FROM reimbursement_requests r
       JOIN categories c ON r.category_id=c.id
       JOIN users u ON r.requester_id=u.id
       LEFT JOIN users m ON r.reviewed_by=m.id
       LEFT JOIN users p ON r.paid_by=p.id
       WHERE r.id=?`,
      [req.params.id]
    );
    if (!request) return res.redirect('/manager/pengajuan');
    res.render('manager/detail', {
      user: req.session.user, request,
      flash: { error: req.flash('error'), success: req.flash('success') }
    });
  } catch (e) { console.error(e); res.redirect('/manager/pengajuan'); }
});

// Approve pengajuan (PENDING → APPROVED)
router.post('/pengajuan/:id/approve', hasRole('MANAGER'), async (req, res) => {
  try {
    const request = await db.getAsync(`SELECT * FROM reimbursement_requests WHERE id=? AND status='PENDING'`, [req.params.id]);
    if (!request) {
      req.flash('error', 'Pengajuan tidak ditemukan atau sudah diproses.');
      return res.redirect(`/manager/pengajuan/${req.params.id}`);
    }
    await db.runAsync(
      `UPDATE reimbursement_requests SET status='APPROVED', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.session.user.id, req.params.id]
    );
    req.flash('success', 'Pengajuan disetujui. Finance akan memproses pembayaran.');
    res.redirect('/manager/pengajuan');
  } catch (e) { console.error(e); res.redirect('/manager/pengajuan'); }
});

// Reject pengajuan (PENDING → REJECTED)
router.post('/pengajuan/:id/reject', hasRole('MANAGER'), async (req, res) => {
  try {
    const { rejection_note } = req.body;
    const request = await db.getAsync(`SELECT * FROM reimbursement_requests WHERE id=? AND status='PENDING'`, [req.params.id]);
    if (!request) {
      req.flash('error', 'Pengajuan tidak ditemukan atau sudah diproses.');
      return res.redirect(`/manager/pengajuan/${req.params.id}`);
    }
    await db.runAsync(
      `UPDATE reimbursement_requests SET status='REJECTED', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP, rejection_note=? WHERE id=?`,
      [req.session.user.id, rejection_note || 'Tidak ada keterangan.', req.params.id]
    );
    req.flash('success', 'Pengajuan telah ditolak.');
    res.redirect('/manager/pengajuan');
  } catch (e) { console.error(e); res.redirect('/manager/pengajuan'); }
});

// Laporan
router.get('/laporan', hasRole('MANAGER'), async (req, res) => {
  try {
    const kasmasuk = await db.allAsync('SELECT f.*, u.name AS actor FROM petty_cash_funds f JOIN users u ON f.created_by=u.id ORDER BY f.created_at DESC');
    const kaskeluar = await db.allAsync(
      `SELECT r.*, u.name AS actor, c.name AS category_name, p.name AS payer_name
       FROM reimbursement_requests r
       JOIN users u ON r.requester_id=u.id
       JOIN categories c ON r.category_id=c.id
       LEFT JOIN users p ON r.paid_by=p.id
       WHERE r.status='PAID' ORDER BY r.paid_at DESC`
    );
    const resIn = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds`);
    const resOut = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='PAID'`);
    const totalIn = parseFloat(resIn.totalIn || 0);
    const totalOut = parseFloat(resOut.totalOut || 0);
    res.render('manager/laporan', { user: req.session.user, kasmasuk, kaskeluar, totalIn, totalOut, balance: totalIn - totalOut });
  } catch (e) { console.error(e); res.redirect('/manager/dashboard'); }
});

module.exports = router;
