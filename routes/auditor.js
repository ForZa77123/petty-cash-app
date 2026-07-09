const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

// GET /auditor/dashboard
router.get('/dashboard', hasRole('AUDITOR'), async (req, res) => {
  try {
    const stats = {
      totalRequests: (await db.getAsync('SELECT COUNT(*) AS c FROM reimbursement_requests')).c,
      pending:       (await db.getAsync("SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='PENDING'")).c,
      approved:      (await db.getAsync("SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='APPROVED'")).c,
      rejected:      (await db.getAsync("SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='REJECTED'")).c,
      totalUsers:    (await db.getAsync('SELECT COUNT(*) AS c FROM users WHERE is_active=1')).c,
      topupCount:    (await db.getAsync('SELECT COUNT(*) AS c FROM petty_cash_funds')).c,
    };
    const resIn  = await db.getAsync('SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds');
    const resOut = await db.getAsync("SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='APPROVED'");
    const totalIn = parseFloat(resIn.totalIn || 0);
    const totalOut = parseFloat(resOut.totalOut || 0);
    const balance = totalIn - totalOut;

    // Last 8 activities (audit trail)
    const recentActivity = await db.allAsync(`
      SELECT 'TOP-UP' AS jenis, f.amount, f.description, f.created_at AS waktu,
             u.name AS pelaku, NULL AS status, NULL AS reviewer
      FROM petty_cash_funds f JOIN users u ON f.created_by = u.id
      UNION ALL
      SELECT
        CASE r.status
          WHEN 'APPROVED' THEN 'DISETUJUI'
          WHEN 'REJECTED' THEN 'DITOLAK'
          ELSE 'PENGAJUAN'
        END,
        r.amount, r.description,
        COALESCE(r.reviewed_at, r.created_at),
        u.name, r.status, rv.name
      FROM reimbursement_requests r
      JOIN users u ON r.requester_id = u.id
      LEFT JOIN users rv ON r.reviewed_by = rv.id
      ORDER BY waktu DESC LIMIT 8
    `);

    res.render('auditor/dashboard', {
      user: req.session.user, stats, totalIn, totalOut, balance, recentActivity
    });
  } catch (e) { console.error(e); res.redirect('/login'); }
});

// GET /auditor/pengajuan — Semua pengajuan, semua status
router.get('/pengajuan', hasRole('AUDITOR'), async (req, res) => {
  try {
    const { status, kategori } = req.query;
    let sql = `
      SELECT r.*, c.name AS category_name, u.name AS requester_name, rv.name AS reviewer_name
      FROM reimbursement_requests r
      JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.requester_id = u.id
      LEFT JOIN users rv ON r.reviewed_by = rv.id
    `;
    const params = [];
    const conditions = [];
    if (status && ['PENDING','APPROVED','REJECTED'].includes(status)) {
      conditions.push('r.status = ?'); params.push(status);
    }
    if (kategori) {
      conditions.push('r.category_id = ?'); params.push(kategori);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY r.created_at DESC';

    const requests = await db.allAsync(sql, params);
    const categories = await db.allAsync('SELECT * FROM categories ORDER BY name');

    res.render('auditor/pengajuan', {
      user: req.session.user, requests, categories,
      currentStatus: status || 'ALL', currentKategori: kategori || ''
    });
  } catch (e) { console.error(e); res.redirect('/auditor/dashboard'); }
});

// GET /auditor/pengajuan/:id — Detail + audit trail
router.get('/pengajuan/:id', hasRole('AUDITOR'), async (req, res) => {
  try {
    const request = await db.getAsync(`
      SELECT r.*, c.name AS category_name, u.name AS requester_name,
             rv.name AS reviewer_name, rv.role AS reviewer_role
      FROM reimbursement_requests r
      JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.requester_id = u.id
      LEFT JOIN users rv ON r.reviewed_by = rv.id
      WHERE r.id = ?
    `, [req.params.id]);

    if (!request) return res.redirect('/auditor/pengajuan');
    res.render('auditor/detail', { user: req.session.user, request });
  } catch (e) { console.error(e); res.redirect('/auditor/pengajuan'); }
});

// GET /auditor/mutasi — Semua mutasi kas (full ledger)
router.get('/mutasi', hasRole('AUDITOR'), async (req, res) => {
  try {
    const { bulan } = req.query;

    let masukSql = `SELECT 'MASUK' AS tipe, f.id, f.amount, f.description, f.created_at AS waktu,
      u.name AS pelaku, u.role AS pelaku_role, NULL AS status, NULL AS rejection_note
      FROM petty_cash_funds f JOIN users u ON f.created_by = u.id`;

    let keluarSql = `SELECT 'KELUAR' AS tipe, r.id, r.amount, r.description, r.reviewed_at AS waktu,
      u.name AS pelaku, u.role AS pelaku_role, r.status, r.rejection_note
      FROM reimbursement_requests r
      JOIN users u ON r.requester_id = u.id
      WHERE r.status = 'APPROVED'`;

    let rejectedSql = `SELECT 'DITOLAK' AS tipe, r.id, r.amount, r.description, r.reviewed_at AS waktu,
      u.name AS pelaku, u.role AS pelaku_role, r.status, r.rejection_note
      FROM reimbursement_requests r
      JOIN users u ON r.requester_id = u.id
      WHERE r.status = 'REJECTED'`;

    if (bulan) {
      masukSql  += ` AND to_char(f.created_at, 'YYYY-MM') = ?`;
      keluarSql += ` AND to_char(r.reviewed_at, 'YYYY-MM') = ?`;
      rejectedSql += ` AND to_char(r.reviewed_at, 'YYYY-MM') = ?`;
    }

    const params = bulan ? [bulan] : [];
    const masuk    = await db.allAsync(masukSql + ' ORDER BY waktu DESC', params);
    const keluar   = await db.allAsync(keluarSql + ' ORDER BY waktu DESC', params);
    const ditolak  = await db.allAsync(rejectedSql + ' ORDER BY waktu DESC', params);

    const resIn  = await db.getAsync('SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds');
    const resOut = await db.getAsync("SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='APPROVED'");
    const totalIn = parseFloat(resIn.totalIn || 0);
    const totalOut = parseFloat(resOut.totalOut || 0);

    res.render('auditor/mutasi', {
      user: req.session.user, masuk, keluar, ditolak,
      totalIn, totalOut, balance: totalIn - totalOut, bulan: bulan || ''
    });
  } catch (e) { console.error(e); res.redirect('/auditor/dashboard'); }
});

module.exports = router;
