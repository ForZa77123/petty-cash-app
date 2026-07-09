require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

// Init DB (creates tables if not exists)
require('./db/init');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'pettycash_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 jam
}));

// Flash messages
app.use(flash());

// Global locals
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/karyawan'));
app.use('/finance', require('./routes/finance'));
app.use('/manager', require('./routes/manager'));
app.use('/auditor', require('./routes/auditor'));
app.use('/admin', require('./routes/admin'));

// Root redirect
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const redirectMap = {
    KARYAWAN: '/dashboard',
    FINANCE: '/finance/dashboard',
    MANAGER: '/manager/dashboard',
    AUDITOR: '/auditor/dashboard',
    ADMIN: '/admin/users',
  };
  res.redirect(redirectMap[req.session.user.role] || '/login');
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render('error', {
    user: req.session.user || null,
    message: 'Halaman Tidak Ditemukan',
    detail: 'Halaman yang Anda cari tidak tersedia.',
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Petty Cash System berjalan di http://localhost:${PORT}`);
    console.log(`📦 Database: PostgreSQL (Supabase)`);
  });
}

module.exports = app;
