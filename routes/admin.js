const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/init');
const { hasRole } = require('../middleware/auth');

router.get('/users', hasRole('ADMIN'), async (req, res) => {
  const users = await db.allAsync('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC');
  res.render('admin/users', { user: req.session.user, users, flash: { error: req.flash('error'), success: req.flash('success') } });
});

router.get('/users/baru', hasRole('ADMIN'), (req, res) => {
  res.render('admin/user-form', { user: req.session.user, editUser: null, flash: { error: req.flash('error') } });
});

router.post('/users', hasRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) { req.flash('error', 'Semua field wajib diisi.'); return res.redirect('/admin/users/baru'); }
    const existing = await db.getAsync('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) { req.flash('error', 'Email sudah terdaftar.'); return res.redirect('/admin/users/baru'); }
    await db.runAsync('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, bcrypt.hashSync(password, 10), role]);
    req.flash('success', `User ${name} berhasil ditambahkan.`);
    res.redirect('/admin/users');
  } catch (e) { console.error(e); req.flash('error', 'Terjadi kesalahan.'); res.redirect('/admin/users/baru'); }
});

router.get('/users/:id/edit', hasRole('ADMIN'), async (req, res) => {
  const editUser = await db.getAsync('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [req.params.id]);
  if (!editUser) { req.flash('error', 'User tidak ditemukan.'); return res.redirect('/admin/users'); }
  res.render('admin/user-form', { user: req.session.user, editUser, flash: { error: req.flash('error') } });
});

router.post('/users/:id/update', hasRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, role, is_active, password } = req.body;
    const target = await db.getAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) { req.flash('error', 'User tidak ditemukan.'); return res.redirect('/admin/users'); }
    const newPassword = password ? bcrypt.hashSync(password, 10) : target.password;
    await db.runAsync("UPDATE users SET name=?, email=?, role=?, is_active=?, password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [name, email, role, is_active === '1' ? 1 : 0, newPassword, req.params.id]);
    req.flash('success', `User ${name} berhasil diperbarui.`);
    res.redirect('/admin/users');
  } catch (e) { console.error(e); req.flash('error', 'Terjadi kesalahan.'); res.redirect('/admin/users'); }
});

router.post('/users/:id/delete', hasRole('ADMIN'), async (req, res) => {
  const target = await db.getAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!target || target.id === req.session.user.id) { req.flash('error', 'Tidak dapat menghapus akun ini.'); return res.redirect('/admin/users'); }
  await db.runAsync('DELETE FROM users WHERE id = ?', [req.params.id]);
  req.flash('success', `User ${target.name} berhasil dihapus.`);
  res.redirect('/admin/users');
});

module.exports = router;
