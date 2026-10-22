const crypto = require('crypto');
const User = require('../models/userModel');

const isApi = req => req.originalUrl.startsWith('/api/');

const deny = (req, res, code, text) => isApi(req)
  ? res.status(code).json({ error: text })
  : res.status(code).render('error', { code, message: text });

async function loadUser(req, res, next) {
  try {
    if (req.session.user) {
      const u = await User.findById(req.session.user.user_id);
      if (!u || !u.is_active) {
        return req.session.regenerate(() => {
          req.session.notice = { type: 'error', text: 'Your account is no longer active.' };
          res.redirect('/login');
        });
      }
      req.session.user = {
        user_id: u.user_id,
        name: u.name,
        email: u.email,
        role: u.role,
        department_id: u.department_id,
        must_change_password: u.must_change_password
      };
    }
    res.locals.currentUser = req.session.user || null;
    res.locals.appShell = !!req.session.user;
    res.locals.path = req.path;
    res.locals.homePath = req.session.user ? homeFor(req.session.user) : '/';
    res.locals.notice = req.session.notice || null;
    delete req.session.notice;
    next();
  } catch (e) {
    next(e);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (isApi(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.session.notice = { type: 'error', text: 'Please log in to continue.' };
    return res.redirect('/login');
  }

  const allowed = ['/change-password', '/logout', '/api/auth/change-password'];
  if (req.session.user.must_change_password && !allowed.includes(req.path) && !allowed.includes(req.originalUrl.split('?')[0])) {
    return isApi(req)
      ? res.status(403).json({ error: 'Password change required' })
      : res.redirect('/change-password');
  }
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.session.user?.role)
    ? next()
    : deny(req, res, 403, 'You do not have permission to access this resource.');

const requireAdmin = requireRole('admin');
const requireStudent = requireRole('student');
const requireDepartment = requireRole('department');
const requireStaff = requireRole('admin', 'department');

function canView(user, g) {
  if (!user || !g) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'student') return g.user_id === user.user_id;
  if (user.role === 'department') return g.department_id != null && g.department_id === user.department_id;
  return false;
}

const homeFor = user => user.role === 'admin' ? '/admin' : user.role === 'department' ? '/department' : '/dashboard';

function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  if (isApi(req)) {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    return next();
  }

  const sent = req.body?._csrf || req.get('x-csrf-token') || '';
  const ok = sent.length === req.session.csrfToken.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrfToken));

  if (!ok) {
    return res.status(403).render('error', {
      code: 403,
      message: 'Invalid or expired form. Please go back, refresh and try again.'
    });
  }
  next();
}

const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX = 5;

const key = req => `${(req.body?.email || '').toLowerCase()}|${req.ip}`;

const loginThrottle = {
  blocked(req) {
    const a = attempts.get(key(req));
    return !!a && a.count >= MAX && Date.now() - a.first < WINDOW;
  },
  fail(req) {
    const k = key(req);
    const a = attempts.get(k);
    if (!a || Date.now() - a.first > WINDOW) {
      attempts.set(k, { count: 1, first: Date.now() });
    } else {
      a.count++;
    }
  },
  reset(req) {
    attempts.delete(key(req));
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) {
    if (now - a.first > WINDOW) {
      attempts.delete(k);
    }
  }
}, WINDOW).unref();

module.exports = {
  loadUser,
  requireAuth,
  requireRole,
  requireAdmin,
  requireStudent,
  requireDepartment,
  requireStaff,
  canView,
  homeFor,
  csrf,
  loginThrottle
};