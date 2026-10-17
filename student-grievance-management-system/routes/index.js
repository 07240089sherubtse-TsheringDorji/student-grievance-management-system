const router = require('express').Router();
const auth = require('../controllers/authController');
const grievances = require('../controllers/grievanceController');
const admin = require('../controllers/adminController');
const dept = require('../controllers/departmentController');
const { requireAuth, requireAdmin, requireStudent, requireDepartment, homeFor } = require('../middleware/auth');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // async errors -> error handler
const w = o => Object.fromEntries(Object.entries(o).map(([k, f]) => [k, typeof f === 'function' ? wrap(f) : f]));
const A = w(admin), D = w(dept), G = w(grievances), U = w(auth);

const publicLayout = (req, res, next) => { res.locals.appShell = false; next(); };
router.get('/', publicLayout, wrap(async (req, res) => { res.render('index', { stats: await require('../models/grievanceModel').stats() }); }));
router.get('/about', publicLayout, (req, res) => res.render('about'));

// Authentication (public)
router.get('/register', U.showRegister); router.post('/register', U.register);
router.get('/signup', U.showRegister);   router.post('/signup', U.register);
router.get('/login', (req, res, next) => req.session.user ? res.redirect(homeFor(req.session.user)) : next(), U.showLogin);
router.post('/login', U.login);
router.post('/logout', U.logout);
router.get('/change-password', requireAuth, U.showChangePassword);
router.post('/change-password', requireAuth, U.changePassword);

// Student
router.get('/dashboard', requireAuth, (req, res, next) => req.session.user.role === 'student' ? next() : res.redirect(homeFor(req.session.user)), G.dashboard);
router.get('/grievances/new', requireAuth, requireStudent, G.newForm);
router.post('/grievances', requireAuth, requireStudent, G.create);
router.get('/grievances/:id', requireAuth, G.detail); // access decided per-case by canView()

// Department staff
router.get('/department', requireAuth, requireDepartment, D.dashboard);
router.post('/department/grievances/:id/status', requireAuth, requireDepartment, D.updateStatus);
router.post('/department/grievances/:id/respond', requireAuth, requireDepartment, D.respond);

// Administrator
router.get('/admin', requireAuth, requireAdmin, A.dashboard);
router.get('/admin/dashboard', requireAuth, requireAdmin, A.dashboard);
router.post('/admin/grievances/:id/status', requireAuth, requireAdmin, A.updateStatus);
router.post('/admin/grievances/:id/assign', requireAuth, requireAdmin, A.assign);
router.post('/admin/grievances/:id/respond', requireAuth, requireAdmin, A.respond);
router.get('/admin/departments', requireAuth, requireAdmin, A.departments);
router.post('/admin/departments', requireAuth, requireAdmin, A.createDepartment);
router.post('/admin/departments/:id/rename', requireAuth, requireAdmin, A.renameDepartment);
router.get('/admin/users', requireAuth, requireAdmin, A.users);
router.post('/admin/users', requireAuth, requireAdmin, A.createUser);
router.post('/admin/users/:id/toggle', requireAuth, requireAdmin, A.toggleUser);
router.post('/admin/users/:id/reset-password', requireAuth, requireAdmin, A.resetPassword);
module.exports = router;
