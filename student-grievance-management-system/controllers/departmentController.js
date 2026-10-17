const Model = require('../models/grievanceModel');
const { events } = require('../events/grievanceEvents');
const { canView } = require('../middleware/auth');

// Department staff may only move a case between these states; ASSIGN and CLOSE stay with administrators.
const deptStatuses = ['IN PROGRESS', 'RESOLVED'];
const fail = (res, code, message) => res.status(code).render('error', { code, message });

// Loads the grievance and enforces that it is assigned to the staff member's department.
async function ownCase(req) {
  const g = await Model.get(Number(req.params.id));
  return g && canView(req.session.user, g) ? g : null;
}

exports.dashboard = async (req, res) => {
  const { department_id: deptId, user_id } = req.session.user;
  const search = (req.query.search || '').trim(), status = deptStatuses.concat(['ASSIGNED', 'CLOSED']).includes(req.query.status) ? req.query.status : '';
  const [items, stats, notifications, depts] = await Promise.all([
    Model.listForDepartment(deptId, search, status), Model.deptStats(deptId), Model.notifications(user_id), Model.departments()]);
  const department = depts.find(d => d.department_id === deptId);
  res.render('department-dashboard', { items, stats, notifications, search, status, department });
};

exports.updateStatus = async (req, res) => {
  const status = req.body.status;
  if (!deptStatuses.includes(status)) return fail(res, 400, 'Department staff can only set IN PROGRESS or RESOLVED.');
  const current = await ownCase(req);
  if (!current) return fail(res, 404, 'Grievance not found.');
  if (current.status === 'CLOSED') return fail(res, 400, 'This grievance is closed. Contact an administrator to reopen it.');
  const g = await Model.updateStatus(current.grievance_id, req.session.user.user_id, status, `Status updated to ${status} by ${req.session.user.name}`);
  events.emit('grievance.statusUpdated', { grievance: g, userId: g.user_id, status });
  req.session.notice = { type: 'success', text: 'Status updated.' };
  res.redirect('/grievances/' + g.grievance_id);
};

exports.respond = async (req, res) => {
  const response = (req.body.response || '').trim();
  if (response.length < 2 || response.length > 3000) return fail(res, 400, 'Response must be between 2 and 3000 characters.');
  const current = await ownCase(req);
  if (!current) return fail(res, 404, 'Grievance not found.');
  const g = await Model.respond(current.grievance_id, req.session.user.user_id, response);
  events.emit('grievance.responded', { grievance: g, userId: g.user_id });
  req.session.notice = { type: 'success', text: 'Response saved.' };
  res.redirect('/grievances/' + g.grievance_id);
};

// ---- JSON API ----
exports.apiList = async (req, res) => res.json({ grievances: await Model.listForDepartment(req.session.user.department_id, req.query.search || '', req.query.status || '') });
exports.apiStatus = async (req, res) => {
  const status = req.body.status;
  if (!deptStatuses.includes(status)) return res.status(400).json({ error: 'Allowed statuses: IN PROGRESS, RESOLVED' });
  const current = await ownCase(req);
  if (!current) return res.status(404).json({ error: 'Grievance not found' });
  if (current.status === 'CLOSED') return res.status(400).json({ error: 'Grievance is closed' });
  const g = await Model.updateStatus(current.grievance_id, req.session.user.user_id, status, `Status updated to ${status} by ${req.session.user.name}`);
  events.emit('grievance.statusUpdated', { grievance: g, userId: g.user_id, status });
  res.json({ grievance: g });
};
exports.apiRespond = async (req, res) => {
  const response = (req.body.response || '').trim();
  if (response.length < 2) return res.status(400).json({ error: 'Response is required' });
  const current = await ownCase(req);
  if (!current) return res.status(404).json({ error: 'Grievance not found' });
  const g = await Model.respond(current.grievance_id, req.session.user.user_id, response);
  events.emit('grievance.responded', { grievance: g, userId: g.user_id });
  res.status(201).json({ grievance: g });
};
