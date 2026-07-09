// Middleware: cek apakah user sudah login
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Silakan login terlebih dahulu.');
  return res.redirect('/login');
}

// Middleware: cek role user
function hasRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Silakan login terlebih dahulu.');
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        user: req.session.user,
        message: 'Akses Ditolak',
        detail: 'Anda tidak memiliki izin untuk mengakses halaman ini.',
      });
    }
    return next();
  };
}

module.exports = { isAuthenticated, hasRole };
