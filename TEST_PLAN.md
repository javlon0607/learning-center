# Learning Center – Test Plan (Admin & Teacher)

Use this to manually test all functions as **Admin** and as **Teacher**.

---

## Test users

| Role    | Username | Password |
|---------|----------|----------|
| Admin   | `admin`  | `password` |
| Teacher | `teacher` | `password` |

The teacher user is created automatically on first load (if not exists). To create more users, log in as admin → Settings → User Management → Add User.

---

## How to run the app

1. **Backend (API)** – from project root:
   ```bash
   php -S localhost:8000 router.php
   ```

2. **Frontend** – from `frontend/`:
   ```bash
   npm run dev
   ```

3. Open **http://localhost:3000** (or the URL Vite shows).

---

## Automated API role test (optional)

From project root (with API running on port 8000):

```bash
php scripts/test-roles-api.php
```

This checks that admin can access admin-only endpoints and teacher gets 403 on them.

---

# Part A: Test as ADMIN

Log in with **admin** / **password**.

## 1. Dashboard
- [ ] Open Dashboard (Home).
- [ ] See stats: Students, Teachers, Groups, Revenue, Expenses, Profit, Leads.
- [ ] No errors in console.

## 2. Students
- [ ] Open **Students**. List loads.
- [ ] Click **Add Student**. Fill form (First name, Last name, optional Phone, etc.) → Save. New row appears.
- [ ] Click a student row or Edit → change something → Save. Row updates.
- [ ] Search by name. List filters.

## 3. Groups
- [ ] Open **Groups**. List loads.
- [ ] Click **Add Group** (or Create). Fill name, subject, teacher, capacity, price → Save.
- [ ] Open a group → add/remove enrollments (enroll student, remove student). Save. Changes persist.

## 4. Teachers
- [ ] Open **Teachers**. List loads.
- [ ] Add teacher. Edit teacher. List and detail views update.

## 5. Leads
- [ ] Open **Leads**. List loads.
- [ ] Add lead. Edit lead. Change status.
- [ ] (If you have a lead) Convert lead to student. New student appears; lead status updates.

## 6. Attendance
- [ ] Open **Attendance**. Select a group and date.
- [ ] See list of enrolled students. Set status (Present / Absent / Late / Excused).
- [ ] Save. Reload page: statuses are saved.

## 7. Payments
- [ ] Open **Payments**. List loads.
- [ ] Record payment: select student, group, amount, date, method → Save. New payment appears in list.

## 8. Expenses
- [ ] Open **Expenses**. List loads.
- [ ] Add expense: category, amount, description, date → Save. New expense appears.

## 9. Salaries
- [ ] Open **Salaries**. List loads.
- [ ] Create salary slip: teacher, period, base, bonus, deduction → Save.
- [ ] Edit a slip: change status to Paid, set paid date → Save.

## 10. Reports
- [ ] Open **Reports**. Select date range.
- [ ] **Overview**: see charts (expenses by category, payment methods).
- [ ] **Payments** tab: table of payments in range.
- [ ] **Expenses** tab: table of expenses in range.
- [ ] **Change history** tab: list of audit log (who changed what, before/after, timestamp). Optional: trigger a change (e.g. edit payment) and see new row here.

## 11. Settings
- [ ] Open **Settings**. See Organization and (as admin) **User Management** card.
- [ ] Open **User Management** (Settings → User Management or /settings/users).

## 12. Users (admin only)
- [ ] List of users loads.
- [ ] **Add User**: username, name, password, role (e.g. Teacher) → Create. User appears in list.
- [ ] **Edit User**: change name or role → Update. Row updates.
- [ ] **Activate/Deactivate**: click icon (UserX = deactivate, UserCheck = activate). Confirm. Status badge and behavior update (deactivated user cannot log in).
- [ ] You cannot deactivate your own account (no toggle for current user).

---

# Part B: Test as TEACHER

Log out, then log in with **teacher** / **password**.

## Sidebar (teacher sees only)
- [ ] **Dashboard**, **Students**, **Groups**, **Attendance** are visible.
- [ ] **Teachers**, **Leads**, **Payments**, **Expenses**, **Salaries**, **Reports**, **Settings** are **not** in the sidebar.

## 1. Dashboard
- [ ] Open Dashboard. Stats load (students, teachers, groups, revenue, etc.). No errors.

## 2. Students
- [ ] Open **Students**. List loads. Can add/edit students (teacher has access).

## 3. Groups
- [ ] Open **Groups**. List loads. Can open a group and see enrollments.

## 4. Attendance
- [ ] Open **Attendance**. Select group and date. Mark present/absent/late. Save. Data persists.

## 5. Forbidden areas (teacher must not access)
- [ ] Manually open **http://localhost:3000/teachers**. You should be redirected to home (or see “Forbidden” / empty) and **not** see teacher list.
- [ ] Same for **/leads**, **/payments**, **/expenses**, **/salaries**, **/reports** – redirect or no data.
- [ ] Open **http://localhost:3000/settings/users**. Redirect to home (admin-only route guard).

---

# Part C: Quick smoke checklist

| Action              | Admin | Teacher |
|---------------------|-------|---------|
| Login               | ✓     | ✓       |
| Dashboard           | ✓     | ✓       |
| Students CRUD       | ✓     | ✓       |
| Groups + enrollments| ✓     | ✓       |
| Teachers CRUD       | ✓     | ✗       |
| Leads CRUD          | ✓     | ✗       |
| Attendance save     | ✓     | ✓       |
| Payments            | ✓     | ✗       |
| Expenses            | ✓     | ✗       |
| Salaries            | ✓     | ✗       |
| Reports             | ✓     | ✗       |
| Settings            | ✓     | ✓ (no Users) |
| User Management     | ✓     | ✗ (redirect) |
| Activate/Deactivate user | ✓ | N/A |

---

If anything fails, check:
- Browser console and network tab (API 403/401/500).
- Backend: PHP and PostgreSQL running; `config.php` DB credentials; `router.php` used for `php -S`.
- Frontend: Vite dev server; API proxy in `vite.config.ts` pointing to `http://localhost:8000`.
