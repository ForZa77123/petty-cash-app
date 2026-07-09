const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

router.get('/dashboard', hasRole('MANAGER'), async (req, res) => {
  try {
    const resIn = await db.getAsync('SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds');
    const resOut = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='APPROVED'`);
    const totalIn = parseFloat(resIn.totalIn || 0);
    const totalOut = parseFloat(resOut.totalOut || 0);
    const balance = totalIn - totalOut;
    const recentMutations = await db.allAsync(`
      SELECT 'TOPUP' AS type, f.amount, f.description, f.created_at AS created_at, u.name AS actor
      FROM petty_cash_funds f JOIN users u ON f.created_by=u.id
      UNION ALL
      SELECT 'KELUAR', r.amount, r.description, r.reviewed_at AS created_at, u.name
      FROM reimbursement_requests r JOIN users u ON r.requester_id=u.id WHERE r.status='APPROVED'
      ORDER BY created_at DESC LIMIT 10
    `);
    const stats = {
      totalRequests: (await db.getAsync('SELECT COUNT(*) AS c FROM reimbursement_requests')).c,
      approved: (await db.getAsync("SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='APPROVED'")).c,
      pending: (await db.getAsync("SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='PENDING'")).c,
      rejected: (await db.getAsync("SELECT COUNT(*) AS c FROM reimbursement_requests WHERE status='REJECTED'")).c,
    };
    res.render('manager/dashboard', { user: req.session.user, totalIn, totalOut, balance, recentMutations, stats });
  } catch (e) { console.error(e); res.redirect('/login'); }
});

router.get('/laporan', hasRole('MANAGER'), async (req, res) => {
  try {
    const kasmasuk = await db.allAsync('SELECT f.*, u.name AS actor FROM petty_cash_funds f JOIN users u ON f.created_by=u.id ORDER BY f.created_at DESC');
    const kaskeluar = await db.allAsync("SELECT r.*, u.name AS actor, c.name AS category_name FROM reimbursement_requests r JOIN users u ON r.requester_id=u.id JOIN categories c ON r.category_id=c.id WHERE r.status='APPROVED' ORDER BY r.reviewed_at DESC");
    const resIn = await db.getAsync('SELECT COALESCE(SUM(amount),0) AS "totalIn" FROM petty_cash_funds');
    const resOut = await db.getAsync(`SELECT COALESCE(SUM(amount),0) AS "totalOut" FROM reimbursement_requests WHERE status='APPROVED'`);
    const totalIn = parseFloat(resIn.totalIn || 0);
    const totalOut = parseFloat(resOut.totalOut || 0);
    res.render('manager/laporan', { user: req.session.user, kasmasuk, kaskeluar, totalIn, totalOut, balance: totalIn - totalOut });
  } catch (e) { console.error(e); res.redirect('/manager/dashboard'); }
});

router.get('/pengajuan/:id', hasRole('MANAGER'), async (req, res) => {
  const request = await db.getAsync(
    'SELECT r.*, c.name AS category_name, u.name AS requester_name, rv.name AS reviewer_name FROM reimbursement_requests r JOIN categories c ON r.category_id=c.id JOIN users u ON r.requester_id=u.id LEFT JOIN users rv ON r.reviewed_by=rv.id WHERE r.id=?',
    [req.params.id]
  );
  if (!request) return res.redirect('/manager/laporan');
  res.render('manager/detail', { user: req.session.user, request });
});

module.exports = router;
