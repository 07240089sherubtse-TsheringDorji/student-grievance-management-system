const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const { homeFor, loginThrottle } = require('../middleware/auth');

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const sessionUser = u => ({
  user_id: u.user_id,
  name: u.name,
  email: u.email,
  role: u.role,
  department_id: u.department_id,
  must_change_password: u.must_change_password
});

const startSession = (req, user) => new Promise((resolve, reject) =>
  req.session.regenerate(err => {
    if (err) return reject(err);
    req.session.user = sessionUser(user);
    resolve();
  })
);

function passwordProblem(pw) {
  if (pw.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    return 'Password must contain at least one letter and one number.';
  }

  return null;
}

exports.passwordProblem = passwordProblem;

exports.showRegister = (req, res) => res.render('register', { error: null });
exports.showLogin = (req, res) => res.render('login', { error: null });

exports.register = async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const problem = name.length < 2 || !EMAIL_RE.test(email)
      ? 'Enter a valid name and email.'
      : passwordProblem(password);

    if (problem) return res.status(400).render('register', { error: problem });

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: 'student'
    });

    await startSession(req, user);
    req.session.notice = { type: 'success', text: 'Account created successfully.' };
    res.redirect('/dashboard');
  } catch (e) {
    res.status(400).render('register', {
      error: e.code === '23505'
        ? 'An account with this email already exists.'
        : 'Unable to create account. Please check your details.'
    });
  }
};

exports.login = async (req, res) => {
  try {
    if (loginThrottle.blocked(req)) {
      return res.status(429).render('login', {
        error: 'Too many failed attempts. Please try again in 15 minutes.'
      });
    }

    const user = await User.findByEmail((req.body.email || '').trim().toLowerCase());
    const ok = user && await bcrypt.compare(req.body.password || '', user.password);

    if (!ok) {
      loginThrottle.fail(req);
      return res.status(401).render('login', { error: 'Email or password is incorrect.' });
    }

    if (!user.is_active) {
      return res.status(403).render('login', {
        error: 'This account has been deactivated. Contact an administrator.'
      });
    }

    loginThrottle.reset(req);
    await startSession(req, user);
    req.session.notice = { type: 'success', text: `Welcome back, ${user.name}.` };
    res.redirect(user.must_change_password ? '/change-password' : homeFor(user));
  } catch (e) {
    console.error(e);
    res.status(500).render('login', { error: 'Unable to log in right now.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

exports.showChangePassword = (req, res) => res.render('change-password', { error: null });

exports.changePassword = async (req, res) => {
  try {
    const { current_password = '', new_password = '', confirm_password = '' } = req.body;
    const user = await User.findById(req.session.user.user_id);
    let error = null;

    if (!(await bcrypt.compare(current_password, user.password))) {
      error = 'Current password is incorrect.';
    } else if (new_password !== confirm_password) {
      error = 'New passwords do not match.';
    } else if (new_password === current_password) {
      error = 'New password must be different from the current one.';
    } else {
      error = passwordProblem(new_password);
    }

    if (error) return res.status(400).render('change-password', { error });

    await User.setPassword(user.user_id, await bcrypt.hash(new_password, 12), false);
    req.session.user.must_change_password = false;
    req.session.notice = { type: 'success', text: 'Password updated.' };
    res.redirect(homeFor(req.session.user));
  } catch (e) {
    console.error(e);
    res.status(500).render('change-password', { error: 'Unable to change password.' });
  }
};


exports.apiRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    if (
      cleanName.length < 2 ||
      !EMAIL_RE.test(cleanEmail) ||
      passwordProblem(cleanPassword)
    ) {
      return res.status(400).json({
        error:
          'Enter a valid name and email. Password must be at least 8 characters and contain at least one letter and one number.'
      });
    }

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: await bcrypt.hash(cleanPassword, 12),
      role: 'student'
    });

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (e) {
    console.error('API registration error:', e);

    if (e.code === '23505') {
      return res.status(400).json({
        error: 'Email already registered. Please use another email or log in.'
      });
    }

    return res.status(500).json({
      error: 'Registration failed. Check the server terminal for details.'
    });
  }
};

exports.apiLogin = async (req, res) => {
  try {
    if (loginThrottle.blocked(req)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    const user = await User.findByEmail(String(req.body.email || '').trim().toLowerCase());

    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) {
      loginThrottle.fail(req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    loginThrottle.reset(req);
    await startSession(req, user);
    res.json({ message: 'Login successful', user: req.session.user });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.apiLogout = (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
};

exports.apiChangePassword = async (req, res) => {
  const { current_password = '', new_password = '' } = req.body;
  const user = await User.findById(req.session.user.user_id);

  if (!(await bcrypt.compare(String(current_password), user.password))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const problem = passwordProblem(String(new_password));
  if (problem) return res.status(400).json({ error: problem });

  await User.setPassword(user.user_id, await bcrypt.hash(String(new_password), 12), false);
  req.session.user.must_change_password = false;
  res.json({ message: 'Password updated' });
};