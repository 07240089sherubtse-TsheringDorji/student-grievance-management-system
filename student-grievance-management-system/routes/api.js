const router = require('express').Router();
const auth = require('../controllers/authController');
const grievances = require('../controllers/grievanceController');
const admin = require('../controllers/adminController');
const dept = require('../controllers/departmentController');
const Model = require('../models/grievanceModel');
const { requireAuth, requireAdmin, requireStudent, requireDepartment } = require('../middleware/auth');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const w = o => Object.fromEntries(Object.entries(o).map(([k, f]) => [k, typeof f === 'function' ? wrap(f) : f]));
const A = w(admin), D = w(dept), G = w(grievances), U = w(auth);

router.post('/auth/register', U.apiRegister);
router.post('/auth/login', U.apiLogin);
router.post('/auth/logout', requireAuth, U.apiLogout);
router.post('/auth/change-password', requireAuth, U.apiChangePassword);

router.get('/categories', G.apiCategories);
router.get('/departments', G.apiDepartments);

router.get('/stats', wrap(async (req, res) => res.json({ stats: await Model.stats() })));

router.get('/grievances/lookup/:reference', requireAuth, wrap(async (req, res) => {
  const ref = String(req.params.reference || '').trim().toLowerCase();
  const u = req.session.user;
  const all = u.role === 'admin' 
    ? await Model.listAll() 
    : u.role === 'department' 
      ? await Model.listForDepartment(u.department_id) 
      : await Model.listForStudent(u.user_id);
  const grievance = all.find(i => i.reference_id.toLowerCase() === ref);

  return grievance 
    ? res.json({ grievance }) 
    : res.status(404).json({ error: 'No grievance found for this reference ID in your account.' });
}));

router.get('/grievances', requireAuth, G.apiList);
router.post('/grievances', requireAuth, requireStudent, G.apiCreate);
router.get('/grievances/:id', requireAuth, G.apiDetail);
router.get('/grievances/:id/history', requireAuth, G.apiHistory);

router.get('/department/grievances', requireAuth, requireDepartment, D.apiList);
router.put('/department/grievances/:id/status', requireAuth, requireDepartment, D.apiStatus);
router.post('/department/grievances/:id/respond', requireAuth, requireDepartment, D.apiRespond);

router.get('/admin/grievances', requireAuth, requireAdmin, A.apiList);
router.get('/admin/grievances/:id', requireAuth, requireAdmin, A.apiDetail);
router.put('/admin/grievances/:id/status', requireAuth, requireAdmin, A.apiStatus);
router.put('/admin/grievances/:id/assign', requireAuth, requireAdmin, A.apiAssign);
router.post('/admin/grievances/:id/respond', requireAuth, requireAdmin, A.apiRespond);
router.get('/admin/users', requireAuth, requireAdmin, A.apiUsers);

module.exports = router;