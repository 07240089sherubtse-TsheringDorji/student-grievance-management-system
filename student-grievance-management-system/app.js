require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { pool, initializeDatabase } = require('./config/db');
const { events } = require('./events/grievanceEvents');
const User = require('./models/userModel');
const { loadUser, csrf } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.SESSION_SECRET) { console.error('SESSION_SECRET must be set in production.'); process.exit(1); }
if (isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-development-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use((req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  next();
});
app.use(loadUser);   // refreshes the logged-in user from the DB (role, department, active flag)
app.use(csrf);       // CSRF token for forms; JSON-only rule for /api writes

app.use('/', require('./routes/index'));

app.use('/api', require('./routes/api'));

events.on('grievance.created', async ({ grievance, userId }) => {
  try {
    await pool.query('INSERT INTO notifications(user_id,grievance_id,message) VALUES($1,$2,$3)', [
      userId, grievance.grievance_id, `Your grievance ${grievance.reference_id} was submitted successfully.`
    ]);
  } catch (error) { console.error('Creation notification failed:', error.message); }
});
events.on('grievance.statusUpdated', async ({ grievance, userId, status }) => {
  try {
    await pool.query('INSERT INTO notifications(user_id,grievance_id,message) VALUES($1,$2,$3)', [
      userId, grievance.grievance_id, `Grievance ${grievance.reference_id} status changed to ${status}.`
    ]);
  } catch (error) { console.error('Status notification failed:', error.message); }
});
events.on('grievance.assigned', async ({ grievance, userId }) => {
  try {
    await pool.query('INSERT INTO notifications(user_id,grievance_id,message) VALUES($1,$2,$3)', [
      userId, grievance.grievance_id, `A department has been assigned to grievance ${grievance.reference_id}.`
    ]);
    for (const staffId of await User.departmentUserIds(grievance.department_id)) {
      await pool.query('INSERT INTO notifications(user_id,grievance_id,message) VALUES($1,$2,$3)', [
        staffId, grievance.grievance_id, `New grievance ${grievance.reference_id} has been assigned to your department.`
      ]);
    }
  } catch (error) { console.error('Assignment notification failed:', error.message); }
});

events.on('grievance.responded', async ({ grievance, userId }) => {
  try {
    await pool.query('INSERT INTO notifications(user_id,grievance_id,message) VALUES($1,$2,$3)', [
      userId, grievance.grievance_id, `There is a new response on grievance ${grievance.reference_id}.`
    ]);
  } catch (error) { console.error('Response notification failed:', error.message); }
});

app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).render('error', { code: 404, message: 'Page not found.' });
  return res.status(404).json({ error: 'Not found' });
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.accepts('html')) return res.status(500).render('error', { code: 500, message: 'Something went wrong. Please try again.' });
  return res.status(500).json({ error: 'Internal server error' });
});

initializeDatabase()
  .then(() => app.listen(PORT, () => console.log(`Student Grievance System running at http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Database initialization failed:', err.message);
    console.error('Check PostgreSQL is running and your .env settings are correct.');
    process.exit(1);
  });
