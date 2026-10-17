# Changes: roles, authentication and authorization

## Roles
| Role | Created by | Can do |
|---|---|---|
| student | self-registration | submit grievances, view only their own |
| department | admin (Users page) | see only grievances assigned to their department; set IN PROGRESS / RESOLVED; respond |
| admin | first-run seed / another admin | everything: assign departments, any status, manage departments and users |

## Authentication
- Public sign-up always creates a **student** (no role can be chosen by the client)
- Session ID regenerated on login (session fixation), destroyed + cookie cleared on logout
- Login throttle: 5 failures / 15 min per email+IP
- Password rule: 8+ chars with a letter and a number; bcrypt cost 12
- Change-password page; forced change for default admin and admin-created/reset accounts
- Deactivated accounts are blocked at login and kicked out on their next request
- Fixed: the old email regex (`\\S`) rejected every real email on registration

## Authorization
- `requireRole()` guards for every route, HTML and /api
- `canView()` decides access to each grievance (owner / assigned department / admin)
- Department staff cannot assign, close, or touch other departments' cases
- Cannot deactivate yourself or the last active admin
- CSRF tokens on all forms; /api writes must be application/json

## Setup
Existing databases migrate automatically on start (new columns + role constraint).
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. Run `npm install` then `npm start`.

## Style
`public/css/style.css` added (teal/white, WCAG AA contrast). Layout lives in `views/partials/header.ejs` and `footer.ejs`.
Reference IDs now use the `.ref-id` badge style.
