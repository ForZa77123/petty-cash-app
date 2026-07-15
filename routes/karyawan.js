const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|pdf/.test(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Hanya file JPG, PNG, atau PDF yang diperbolehkan.'));
  },
});

router.get('/dashboard', hasRole('KARYAWAN'), async (req, res) => {
  try {
    const user = req.session.user;
    const requests = await db.allAsync(
      'SELECT r.*, c.name AS category_name FROM reimbursement_requests r JOIN categories c ON r.category_id = c.id WHERE r.requester_id = ? ORDER BY r.created_at DESC',
      [user.id]
    );
    const stats = {
      pending: requests.filter(r => r.status === 'PENDING').length,
      approved: requests.filter(r => r.status === 'APPROVED' || r.status === 'PAID').length,
      rejected: requests.filter(r => r.status === 'REJECTED').length,
    };
    res.render('karyawan/dashboard', { user, requests, stats, flash: { error: req.flash('error'), success: req.flash('success') } });
  } catch (e) { console.error(e); res.redirect('/login'); }
});

router.get('/pengajuan/baru', hasRole('KARYAWAN'), async (req, res) => {
  const categories = await db.allAsync('SELECT * FROM categories ORDER BY name');
  res.render('karyawan/create', { user: req.session.user, categories, flash: { error: req.flash('error') } });
});

router.post('/pengajuan', hasRole('KARYAWAN'), upload.single('receipt'), async (req, res) => {
  try {
    const { description, category_id, amount, request_date } = req.body;
    if (!req.file) { req.flash('error', 'Foto bukti nota wajib diunggah.'); return res.redirect('/pengajuan/baru'); }
    if (!description || !category_id || !amount || !request_date) { req.flash('error', 'Semua field wajib diisi.'); return res.redirect('/pengajuan/baru'); }
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await db.runAsync(
      'INSERT INTO reimbursement_requests (requester_id, category_id, description, amount, receipt_image_path, request_date) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.user.id, category_id, description, parseFloat(amount), base64Image, request_date]
    );
    req.flash('success', 'Pengajuan berhasil dikirim! Menunggu persetujuan Finance.');
    res.redirect('/dashboard');
  } catch (e) { console.error(e); req.flash('error', 'Terjadi kesalahan, coba lagi.'); res.redirect('/pengajuan/baru'); }
});

router.get('/pengajuan/:id', hasRole('KARYAWAN'), async (req, res) => {
  const request = await db.getAsync(
    `SELECT r.*, c.name AS category_name, u.name AS requester_name, 
            m.name AS manager_name, m.role AS reviewer_role, p.name AS payer_name
     FROM reimbursement_requests r 
     JOIN categories c ON r.category_id = c.id 
     JOIN users u ON r.requester_id = u.id 
     LEFT JOIN users m ON r.reviewed_by = m.id
     LEFT JOIN users p ON r.paid_by = p.id
     WHERE r.id = ? AND r.requester_id = ?`,
    [req.params.id, req.session.user.id]
  );
  if (!request) { req.flash('error', 'Pengajuan tidak ditemukan.'); return res.redirect('/dashboard'); }
  res.render('karyawan/detail', { user: req.session.user, request, flash: { error: req.flash('error') } });
});

module.exports = router;
