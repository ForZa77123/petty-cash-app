const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/init');

router.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.render('auth/login', { error: req.flash('error'), success: req.flash('success') });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Email dan password wajib diisi.');
      return res.redirect('/login');
    }
    const user = await db.getAsync('SELECT * FROM users WHERE email = ? AND is_active = 1', [email.trim()]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      req.flash('error', 'Email atau password salah.');
      return res.redirect('/login');
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    const map = { KARYAWAN: '/dashboard', FINANCE: '/finance/dashboard', MANAGER: '/manager/dashboard', AUDITOR: '/auditor/dashboard', ADMIN: '/admin/users' };
    res.redirect(map[user.role] || '/dashboard');
  } catch (e) { console.error(e); res.redirect('/login'); }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
