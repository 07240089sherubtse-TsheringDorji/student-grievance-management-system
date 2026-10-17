const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Model = require('../models/grievanceModel');
const User = require('../models/userModel');
const { events } = require('../events/grievanceEvents');
const { passwordProblem } = require('./authController');

const allowed = ['SUBMITTED', 'UNDER REVIEW', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED', 'CLOSED'];
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const fail = (res, code, message) => res.status(code).render('error', { code, message });

// ---------- Grievances ----------
exports.dashboard = async (req, res) => {
  const search = (req.query.search || '').trim(), status = allowed.includes(req.query.status) ? req.query.status : '';
  const [items, stats, depts] = await Promise.all([Model.listAll(search, status), Model.stats(), Model.departments()]);
  res.render('admin-dashboard', { items, stats, depts, search, status, allowed });
};
exports.updateStatus = async (req, res) => {
  const status = req.body.status;
  if (!allowed.includes(status)) return fail(res, 400, 'Invalid grievance status.');
  const g = await Model.updateStatus(Number(req.params.id), req.session.user.user_id, status, `Status updated to ${status}`);
  if (!g) return fail(res, 404, 'Grievance not found.');
  events.emit('grievance.statusUpdated', { grievance: g, userId: g.user_id, status });
  req.session.notice = { type: 'success', text: 'Grievance status updated.' };
  res.redirect('/grievances/' + g.grievance_id);
};
exports.assign = async (req, res) => {
  const id = Number(req.body.department_id), depts = await Model.departments();
  if (!depts.some(d => d.department_id === id)) return fail(res, 400, 'Choose a valid department.');
  const g = await Model.assign(Number(req.params.id), req.session.user.user_id, id);
  if (!g) return fail(res, 404, 'Grievance not found.');
  events.emit('grievance.assigned', { grievance: g, userId: g.user_id });
  req.session.notice = { type: 'success', text: 'Department assigned.' };
  res.redirect('/grievances/' + g.grievance_id);
};
exports.respond = async (req, res) => {
  const response = (req.body.response || '').trim();
  if (response.length < 2 || response.length > 3000) return fail(res, 400, 'Response must be between 2 and 3000 characters.');
  const g = await Model.respond(Number(req.params.id), req.session.user.user_id, response);
  if (!g) return fail(res, 404, 'Grievance not found.');
  req.session.notice = { type: 'success', text: 'Response saved.' };
  res.redirect('/grievances/' + g.grievance_id);
};

// ---------- Departments ----------
exports.departments = async (req, res) => res.render('admin-departments', { departments: await Model.departmentsWithCounts() });
exports.createDepartment = async (req, res) => {
  const name = (req.body.department_name || '').trim();
  if (name.length < 2 || name.length > 100) return fail(res, 400, 'Department name must be 2–100 characters.');
  try { await Model.createDepartment(name); req.session.notice = { type: 'success', text: 'Department created.' }; }
  catch (e) { req.session.notice = { type: 'error', text: e.code === '23505' ? 'A department with that name already exists.' : 'Could not create department.' }; }
  res.redirect('/admin/departments');
};
exports.renameDepartment = async (req, res) => {
  const name = (req.body.department_name || '').trim();
  if (name.length < 2 || name.length > 100) return fail(res, 400, 'Department name must be 2–100 characters.');
  try {
    const d = await Model.renameDepartment(Number(req.params.id), name);
    req.session.notice = d ? { type: 'success', text: 'Department renamed.' } : { type: 'error', text: 'Department not found.' };
  } catch (e) { req.session.notice = { type: 'error', text: 'That name is already in use.' }; }
  res.redirect('/admin/departments');
};

// ---------- Users ----------
exports.users = async (req, res) => res.render('admin-users', { users: await User.listAll(), departments: await Model.departments(), error: null, form: {}, tempPassword: null });
exports.createUser = async (req, res) => {
  const name = (req.body.name || '').trim(), email = (req.body.email || '').trim().toLowerCase();
  const role = req.body.role, departmentId = Number(req.body.department_id) || null;
  let error = null;
  if (name.length < 2 || !EMAIL_RE.test(email)) error = 'Enter a valid name and email.';
  else if (!['admin', 'department'].includes(role)) error = 'Role must be Administrator or Department staff.';
  else if (role === 'department' && !(await Model.departments()).some(d => d.department_id === departmentId)) error = 'Department staff must belong to a department.';
  const reload = async (error, tempPassword = null) => res.status(error ? 400 : 200).render('admin-users', { users: await User.listAll(), departments: await Model.departments(), error, form: error ? req.body : {}, tempPassword });
  if (error) return reload(error);
  // Temporary password is shown once; the user must change it at first login.
  const temp = crypto.randomBytes(6).toString('base64url') + '7a';
  try {
    await User.create({ name, email, password: await bcrypt.hash(temp, 12), role, departmentId: role === 'department' ? departmentId : null, mustChange: true });
    return reload(null, { email, password: temp });
  } catch (e) { return reload(e.code === '23505' ? 'An account with this email already exists.' : 'Could not create account.'); }
};
exports.toggleUser = async (req, res) => {
  const id = Number(req.params.id), target = await User.findById(id);
  if (!target) return fail(res, 404, 'User not found.');
  if (id === req.session.user.user_id) { req.session.notice = { type: 'error', text: 'You cannot deactivate your own account.' }; return res.redirect('/admin/users'); }
  if (target.role === 'admin' && target.is_active && (await User.countActiveAdmins()) <= 1) { req.session.notice = { type: 'error', text: 'At least one active administrator is required.' }; return res.redirect('/admin/users'); }
  await User.setActive(id, !target.is_active);
  req.session.notice = { type: 'success', text: `Account ${target.is_active ? 'deactivated' : 'reactivated'}.` };
  res.redirect('/admin/users');
};
exports.resetPassword = async (req, res) => {
  const id = Number(req.params.id), target = await User.findById(id);
  if (!target) return fail(res, 404, 'User not found.');
  if (id === req.session.user.user_id) { req.session.notice = { type: 'error', text: 'Use “Change password” for your own account.' }; return res.redirect('/admin/users'); }
  const temp = crypto.randomBytes(6).toString('base64url') + '7a';
  await User.setPassword(id, await bcrypt.hash(temp, 12), true);
  res.render('admin-users', { users: await User.listAll(), departments: await Model.departments(), error: null, form: {}, tempPassword: { email: target.email, password: temp } });
};

// ---------- JSON API ----------
exports.apiList = async (req, res) => res.json({ grievances: await Model.listAll(req.query.search || '', req.query.status || '') });
exports.apiDetail = async (req, res) => { const g = await Model.get(Number(req.params.id)); return g ? res.json({ grievance: g, history: await Model.history(g.grievance_id) }) : res.status(404).json({ error: 'Grievance not found' }); };
exports.apiStatus = async (req, res) => {
  const status = req.body.status;
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const g = await Model.updateStatus(Number(req.params.id), req.session.user.user_id, status, `Status updated to ${status}`);
  if (!g) return res.status(404).json({ error: 'Grievance not found' });
  events.emit('grievance.statusUpdated', { grievance: g, userId: g.user_id, status });
  res.json({ grievance: g });
};
exports.apiAssign = async (req, res) => {
  const dept = Number(req.body.department_id);
  if (!(await Model.departments()).some(d => d.department_id === dept)) return res.status(400).json({ error: 'Invalid department_id' });
  const g = await Model.assign(Number(req.params.id), req.session.user.user_id, dept);
  if (!g) return res.status(404).json({ error: 'Grievance not found' });
  events.emit('grievance.assigned', { grievance: g, userId: g.user_id });
  res.json({ grievance: g });
};
exports.apiRespond = async (req, res) => {
  const response = (req.body.response || '').trim();
  if (response.length < 2) return res.status(400).json({ error: 'Response is required' });
  const g = await Model.respond(Number(req.params.id), req.session.user.user_id, response);
  return g ? res.status(201).json({ grievance: g }) : res.status(404).json({ error: 'Grievance not found' });
};
exports.apiUsers = async (req, res) => res.json({ users: await User.listAll() });
