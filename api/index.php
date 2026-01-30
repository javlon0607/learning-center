<?php
/**
 * REST API entry - TRD aligned
 * All routes under /api/ (e.g. /api/students, /api/leads)
 */
define('IS_API', true);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';
initDB();

$method = $_SERVER['REQUEST_METHOD'];
$path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
$path = preg_replace('#^api/?(index\.php/?)?#', '', $path);
$segments = $path ? explode('/', $path) : [];
$resource = $segments[0] ?? '';
$id = isset($segments[1]) && ctype_digit($segments[1]) ? (int)$segments[1] : null;
$sub = $segments[2] ?? '';

$input = [];
if (in_array($method, ['POST', 'PUT']) && strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
} elseif ($method === 'POST' || $method === 'PUT') {
    $input = $_POST ?: (json_decode(file_get_contents('php://input'), true) ?: []);
}

function jsonResponse($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}

function jsonError($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
}

try {
    switch ($resource) {
        case 'login':
            if ($method !== 'POST') { jsonError('Method not allowed', 405); break; }
            $stmt = db()->prepare("SELECT id, username, password, name, role FROM users WHERE username = ?");
            $stmt->execute([$input['username'] ?? '']);
            $u = $stmt->fetch();
            if (!$u || !password_verify($input['password'] ?? '', $u['password'])) {
                jsonError('Invalid credentials', 401);
                break;
            }
            unset($u['password']);
            $u['id'] = (int)$u['id'];
            $_SESSION['user'] = $u;
            $_SESSION['last_activity'] = time();
            activityLog('login', 'user', $u['id']);
            jsonResponse(['user' => $_SESSION['user']]);
            break;

        case 'logout':
            if ($method !== 'POST') { jsonError('Method not allowed', 405); break; }
            activityLog('logout', 'user', $_SESSION['user']['id'] ?? null);
            unset($_SESSION['user'], $_SESSION['last_activity']);
            jsonResponse(['ok' => true]);
            break;

        case 'me':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            jsonResponse(['user' => $_SESSION['user'], 'last_activity' => $_SESSION['last_activity'] ?? null]);
            break;

        case 'students':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method === 'GET') {
                $q = "SELECT * FROM students ORDER BY created_at DESC";
                $params = [];
                if (!empty($_GET['status'])) { $q = "SELECT * FROM students WHERE status = ? ORDER BY created_at DESC"; $params[] = $_GET['status']; }
                if (!empty($_GET['search'])) { $q = "SELECT * FROM students WHERE first_name ILIKE ? OR last_name ILIKE ? OR phone ILIKE ? ORDER BY created_at DESC"; $s = '%'.$_GET['search'].'%'; $params = [$s,$s,$s]; }
                $stmt = $params ? db()->prepare($q) : db()->query($q); if ($params) $stmt->execute($params);
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO students (first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes) VALUES (?,?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['dob'] ?? null, $input['phone'] ?? '', $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $input['status'] ?? 'active', $input['notes'] ?? ''
                ]);
                $id = db()->lastInsertId();
                activityLog('create', 'student', $id);
                jsonResponse(['id' => (int)$id]);
            } elseif ($id && $method === 'PUT') {
                $stmt = db()->prepare("UPDATE students SET first_name=?, last_name=?, dob=?, phone=?, email=?, parent_name=?, parent_phone=?, status=?, notes=? WHERE id=?");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['dob'] ?? null, $input['phone'] ?? '', $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $input['status'] ?? 'active', $input['notes'] ?? '', $id
                ]);
                activityLog('update', 'student', $id);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                db()->prepare("DELETE FROM students WHERE id=?")->execute([$id]);
                activityLog('delete', 'student', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'teachers':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT * FROM teachers ORDER BY created_at DESC");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO teachers (first_name, last_name, phone, email, subjects, salary_type, salary_amount, status) VALUES (?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['phone'] ?? '', $input['email'] ?? '',
                    $input['subjects'] ?? '', $input['salary_type'] ?? 'fixed', $input['salary_amount'] ?? 0, $input['status'] ?? 'active'
                ]);
                activityLog('create', 'teacher', db()->lastInsertId());
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($id && $method === 'PUT') {
                $stmt = db()->prepare("UPDATE teachers SET first_name=?, last_name=?, phone=?, email=?, subjects=?, salary_type=?, salary_amount=?, status=? WHERE id=?");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['phone'] ?? '', $input['email'] ?? '',
                    $input['subjects'] ?? '', $input['salary_type'] ?? 'fixed', $input['salary_amount'] ?? 0, $input['status'] ?? 'active', $id
                ]);
                activityLog('update', 'teacher', $id);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                db()->prepare("DELETE FROM teachers WHERE id=?")->execute([$id]);
                activityLog('delete', 'teacher', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'groups':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT g.*, t.first_name || ' ' || t.last_name AS teacher_name FROM groups g LEFT JOIN teachers t ON g.teacher_id = t.id ORDER BY g.created_at DESC");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO groups (name, subject, teacher_id, capacity, price, status) VALUES (?,?,?,?,?,?)");
                $stmt->execute([
                    $input['name'] ?? '', $input['subject'] ?? '', $input['teacher_id'] ?: null, $input['capacity'] ?? 15, $input['price'] ?? 0, $input['status'] ?? 'active'
                ]);
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($id && $method === 'PUT') {
                $stmt = db()->prepare("UPDATE groups SET name=?, subject=?, teacher_id=?, capacity=?, price=?, status=? WHERE id=?");
                $stmt->execute([
                    $input['name'] ?? '', $input['subject'] ?? '', $input['teacher_id'] ?: null, $input['capacity'] ?? 15, $input['price'] ?? 0, $input['status'] ?? 'active', $id
                ]);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                db()->prepare("DELETE FROM groups WHERE id=?")->execute([$id]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'enrollments':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method === 'GET') {
                $group = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
                $student = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
                if ($group) {
                    $stmt = db()->prepare("SELECT e.*, s.first_name || ' ' || s.last_name AS student_name FROM enrollments e JOIN students s ON e.student_id = s.id WHERE e.group_id = ?");
                    $stmt->execute([$group]);
                } elseif ($student) {
                    $stmt = db()->prepare("SELECT e.*, g.name AS group_name FROM enrollments e JOIN groups g ON e.group_id = g.id WHERE e.student_id = ?");
                    $stmt->execute([$student]);
                } else {
                    $stmt = db()->query("SELECT e.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name FROM enrollments e JOIN students s ON e.student_id = s.id JOIN groups g ON e.group_id = g.id ORDER BY e.enrolled_at DESC");
                }
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO enrollments (student_id, group_id) VALUES (?,?) ON CONFLICT (student_id, group_id) DO NOTHING");
                $stmt->execute([(int)($input['student_id'] ?? 0), (int)($input['group_id'] ?? 0)]);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                $stmt = db()->prepare("DELETE FROM enrollments WHERE id = ?");
                $stmt->execute([$id]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'payments':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT p.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name FROM payments p JOIN students s ON p.student_id = s.id LEFT JOIN groups g ON p.group_id = g.id ORDER BY p.payment_date DESC LIMIT 500");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO payments (student_id, group_id, amount, payment_date, method, notes) VALUES (?,?,?,?,?,?)");
                $stmt->execute([
                    (int)($input['student_id'] ?? 0), $input['group_id'] ? (int)$input['group_id'] : null,
                    (float)($input['amount'] ?? 0), $input['payment_date'] ?? date('Y-m-d'), $input['method'] ?? 'cash', $input['notes'] ?? ''
                ]);
                $pid = db()->lastInsertId();
                $invNo = 'INV-' . date('Ymd') . '-' . str_pad($pid, 4, '0', STR_PAD_LEFT);
                try { db()->prepare("INSERT INTO payment_invoices (payment_id, invoice_no) VALUES (?,?)")->execute([$pid, $invNo]); } catch (Exception $e) {}
                activityLog('create', 'payment', $pid);
                jsonResponse(['id' => (int)$pid, 'invoice_no' => $invNo]);
            } else { jsonError('Not found', 404); }
            break;

        case 'expenses':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT * FROM expenses ORDER BY expense_date DESC LIMIT 500");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO expenses (category, amount, description, expense_date) VALUES (?,?,?,?)");
                $stmt->execute([$input['category'] ?? '', (float)($input['amount'] ?? 0), $input['description'] ?? '', $input['expense_date'] ?? date('Y-m-d')]);
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } else { jsonError('Not found', 404); }
            break;

        case 'leads':
            requireRole(['admin', 'manager']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT * FROM leads ORDER BY created_at DESC");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO leads (first_name, last_name, phone, email, parent_name, parent_phone, source, status, notes, follow_up_date) VALUES (?,?,?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['phone'] ?? '', $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $input['source'] ?? '', $input['status'] ?? 'new', $input['notes'] ?? '', $input['follow_up_date'] ?? null
                ]);
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($id && $method === 'PUT') {
                $stmt = db()->prepare("UPDATE leads SET first_name=?, last_name=?, phone=?, email=?, parent_name=?, parent_phone=?, source=?, status=?, notes=?, follow_up_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['phone'] ?? '', $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $input['source'] ?? '', $input['status'] ?? 'new', $input['notes'] ?? '', $input['follow_up_date'] ?? null, $id
                ]);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                db()->prepare("DELETE FROM leads WHERE id=?")->execute([$id]);
                jsonResponse(['ok' => true]);
            } elseif ($id && $sub === 'convert' && $method === 'POST') {
                $lead = db()->prepare("SELECT * FROM leads WHERE id = ?");
                $lead->execute([$id]);
                $l = $lead->fetch();
                if (!$l) { jsonError('Lead not found', 404); break; }
                $stmt = db()->prepare("INSERT INTO students (first_name, last_name, phone, email, parent_name, parent_phone, status, notes) VALUES (?,?,?,?,?,?,?,?)");
                $stmt->execute([$l['first_name'], $l['last_name'], $l['phone'], $l['email'], $l['parent_name'], $l['parent_phone'], 'active', $l['notes']]);
                $sid = db()->lastInsertId();
                db()->prepare("UPDATE leads SET status='enrolled', converted_student_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$sid, $id]);
                activityLog('lead_convert', 'lead', $id);
                jsonResponse(['student_id' => (int)$sid]);
            } else { jsonError('Not found', 404); }
            break;

        case 'attendance':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method === 'GET') {
                $date = $_GET['date'] ?? date('Y-m-d');
                $group = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
                if (!$group) { jsonError('group_id required'); break; }
                $stmt = db()->prepare("SELECT e.student_id, s.first_name || ' ' || s.last_name AS student_name, a.id AS attendance_id, a.status AS attendance_status FROM enrollments e JOIN students s ON e.student_id = s.id LEFT JOIN attendance a ON a.student_id = e.student_id AND a.group_id = e.group_id AND a.attendance_date = ? WHERE e.group_id = ? ORDER BY s.last_name");
                $stmt->execute([$date, $group]);
                jsonResponse(['date' => $date, 'group_id' => $group, 'rows' => $stmt->fetchAll()]);
            } elseif ($method === 'POST') {
                $date = $input['date'] ?? date('Y-m-d');
                $group = (int)($input['group_id'] ?? 0);
                $rows = $input['rows'] ?? [];
                foreach ($rows as $r) {
                    $sid = (int)($r['student_id'] ?? 0);
                    $status = $r['status'] ?? 'present';
                    if (!$sid || !$group) continue;
                    db()->prepare("INSERT INTO attendance (student_id, group_id, attendance_date, status) VALUES (?,?,?,?) ON CONFLICT (student_id, group_id, attendance_date) DO UPDATE SET status = ?")
                        ->execute([$sid, $group, $date, $status, $status]);
                }
                activityLog('attendance_save', 'attendance', null, json_encode(['date' => $date, 'group_id' => $group]));
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'salary-slips':
            requireRole(['admin', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT sl.*, t.first_name || ' ' || t.last_name AS teacher_name FROM salary_slips sl JOIN teachers t ON sl.teacher_id = t.id ORDER BY sl.period_end DESC LIMIT 200");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $tid = (int)($input['teacher_id'] ?? 0);
                $start = $input['period_start'] ?? '';
                $end = $input['period_end'] ?? '';
                $base = (float)($input['base_amount'] ?? 0);
                $bonus = (float)($input['bonus'] ?? 0);
                $ded = (float)($input['deduction'] ?? 0);
                $total = $base + $bonus - $ded;
                $stmt = db()->prepare("INSERT INTO salary_slips (teacher_id, period_start, period_end, base_amount, bonus, deduction, total_amount, status, notes) VALUES (?,?,?,?,?,?,?,?,?)");
                $stmt->execute([$tid, $start, $end, $base, $bonus, $ded, $total, $input['status'] ?? 'pending', $input['notes'] ?? '']);
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($id && $method === 'PUT') {
                $stmt = db()->prepare("UPDATE salary_slips SET status=?, paid_at=? WHERE id=?");
                $stmt->execute([$input['status'] ?? 'pending', $input['paid_at'] ?? null, $id]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'dashboard':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($sub === 'stats') {
                $students = db()->query("SELECT COUNT(*) FROM students WHERE status='active'")->fetchColumn();
                $teachers = db()->query("SELECT COUNT(*) FROM teachers WHERE status='active'")->fetchColumn();
                $groups = db()->query("SELECT COUNT(*) FROM groups WHERE status='active'")->fetchColumn();
                $revenue = db()->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date >= date_trunc('month', CURRENT_DATE)")->fetchColumn();
                $expenses = db()->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date >= date_trunc('month', CURRENT_DATE)")->fetchColumn();
                $leads = db()->query("SELECT COUNT(*) FROM leads WHERE status IN ('new','contacted','trial')")->fetchColumn();
                jsonResponse([
                    'students' => (int)$students,
                    'teachers' => (int)$teachers,
                    'groups' => (int)$groups,
                    'revenue' => (float)$revenue,
                    'expenses' => (float)$expenses,
                    'profit' => (float)$revenue - (float)$expenses,
                    'leads_pending' => (int)$leads
                ]);
            } else { jsonError('Not found', 404); }
            break;

        case 'reports':
            requireRole(['admin', 'manager', 'accountant']);
            $report = $sub ?: ($_GET['type'] ?? '');
            $from = $_GET['from'] ?? date('Y-m-01');
            $to = $_GET['to'] ?? date('Y-m-d');
            if ($report === 'payments') {
                $stmt = db()->prepare("SELECT p.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name FROM payments p JOIN students s ON p.student_id = s.id LEFT JOIN groups g ON p.group_id = g.id WHERE p.payment_date BETWEEN ? AND ? ORDER BY p.payment_date");
                $stmt->execute([$from, $to]);
                jsonResponse($stmt->fetchAll());
            } elseif ($report === 'expenses') {
                $stmt = db()->prepare("SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date");
                $stmt->execute([$from, $to]);
                jsonResponse($stmt->fetchAll());
            } elseif ($report === 'income-expense') {
                $inc = db()->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date BETWEEN ? AND ?");
                $inc->execute([$from, $to]);
                $exp = db()->prepare("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date BETWEEN ? AND ?");
                $exp->execute([$from, $to]);
                jsonResponse(['from' => $from, 'to' => $to, 'income' => (float)$inc->fetchColumn(), 'expense' => (float)$exp->fetchColumn()]);
            } elseif ($report === 'attendance') {
                $groupId = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
                $q = "SELECT a.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name
                      FROM attendance a
                      JOIN students s ON a.student_id = s.id
                      JOIN groups g ON a.group_id = g.id
                      WHERE a.attendance_date BETWEEN ? AND ?";
                $params = [$from, $to];
                if ($groupId) {
                    $q .= " AND a.group_id = ?";
                    $params[] = $groupId;
                }
                $q .= " ORDER BY a.attendance_date DESC, g.name";
                $stmt = db()->prepare($q);
                $stmt->execute($params);
                jsonResponse($stmt->fetchAll());
            } else { jsonError('Report type required'); }
            break;

        case 'users':
            requireRole(['admin']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT id, username, name, role, email, phone, is_active, last_login, created_at FROM users ORDER BY created_at DESC");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $password = password_hash($input['password'] ?? 'password', PASSWORD_DEFAULT);
                $stmt = db()->prepare("INSERT INTO users (username, password, name, role, email, phone, is_active) VALUES (?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['username'] ?? '', $password, $input['name'] ?? '',
                    $input['role'] ?? 'user', $input['email'] ?? '', $input['phone'] ?? '', true
                ]);
                activityLog('create', 'user', db()->lastInsertId());
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($id && $method === 'PUT') {
                $fields = ['name', 'role', 'email', 'phone', 'is_active'];
                $sets = [];
                $params = [];
                foreach ($fields as $f) {
                    if (isset($input[$f])) {
                        $sets[] = "$f = ?";
                        $params[] = $input[$f];
                    }
                }
                if (!empty($input['password'])) {
                    $sets[] = "password = ?";
                    $params[] = password_hash($input['password'], PASSWORD_DEFAULT);
                }
                if ($sets) {
                    $params[] = $id;
                    $stmt = db()->prepare("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?");
                    $stmt->execute($params);
                    activityLog('update', 'user', $id);
                }
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                db()->prepare("DELETE FROM users WHERE id = ? AND id != ?")->execute([$id, $_SESSION['user']['id']]);
                activityLog('delete', 'user', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'schedules':
            requireRole(['admin', 'manager', 'teacher']);
            if ($method === 'GET') {
                $groupId = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
                if ($groupId) {
                    $stmt = db()->prepare("SELECT * FROM group_schedules WHERE group_id = ? ORDER BY day_of_week, start_time");
                    $stmt->execute([$groupId]);
                } else {
                    $stmt = db()->query("SELECT gs.*, g.name AS group_name FROM group_schedules gs JOIN groups g ON gs.group_id = g.id ORDER BY g.name, gs.day_of_week, gs.start_time");
                }
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO group_schedules (group_id, day_of_week, start_time, end_time, classroom) VALUES (?,?,?,?,?)");
                $stmt->execute([
                    (int)($input['group_id'] ?? 0), (int)($input['day_of_week'] ?? 0),
                    $input['start_time'] ?? '09:00', $input['end_time'] ?? '10:00', $input['classroom'] ?? ''
                ]);
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($id && $method === 'PUT') {
                $stmt = db()->prepare("UPDATE group_schedules SET day_of_week=?, start_time=?, end_time=?, classroom=? WHERE id=?");
                $stmt->execute([
                    (int)($input['day_of_week'] ?? 0), $input['start_time'] ?? '09:00',
                    $input['end_time'] ?? '10:00', $input['classroom'] ?? '', $id
                ]);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                db()->prepare("DELETE FROM group_schedules WHERE id = ?")->execute([$id]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'settings':
            requireRole(['admin']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT key, value, description FROM settings ORDER BY key");
                $settings = [];
                foreach ($stmt->fetchAll() as $row) {
                    $settings[$row['key']] = $row['value'];
                }
                jsonResponse($settings);
            } elseif ($method === 'PUT') {
                foreach ($input as $key => $value) {
                    $stmt = db()->prepare("UPDATE settings SET value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?");
                    $stmt->execute([$value, $_SESSION['user']['id'], $key]);
                }
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'notifications':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            $userId = $_SESSION['user']['id'];
            if ($method === 'GET') {
                $stmt = db()->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
                $stmt->execute([$userId]);
                jsonResponse($stmt->fetchAll());
            } elseif ($id && $method === 'PUT' && $sub === 'read') {
                $stmt = db()->prepare("UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?");
                $stmt->execute([$id, $userId]);
                jsonResponse(['ok' => true]);
            } elseif ($method === 'PUT' && $sub === 'read-all') {
                $stmt = db()->prepare("UPDATE notifications SET is_read = true WHERE user_id = ?");
                $stmt->execute([$userId]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'students-import':
            requireRole(['admin', 'manager']);
            if ($method === 'POST') {
                $rows = $input['rows'] ?? [];
                $imported = 0;
                foreach ($rows as $row) {
                    if (empty($row['first_name']) || empty($row['last_name'])) continue;
                    $stmt = db()->prepare("INSERT INTO students (first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes) VALUES (?,?,?,?,?,?,?,?,?)");
                    $stmt->execute([
                        $row['first_name'] ?? '', $row['last_name'] ?? '', $row['dob'] ?? null,
                        $row['phone'] ?? '', $row['email'] ?? '', $row['parent_name'] ?? '',
                        $row['parent_phone'] ?? '', $row['status'] ?? 'active', $row['notes'] ?? ''
                    ]);
                    $imported++;
                }
                activityLog('bulk_import', 'student', null, json_encode(['count' => $imported]));
                jsonResponse(['imported' => $imported]);
            } else { jsonError('Not found', 404); }
            break;

        case 'students-export':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT id, first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes, created_at FROM students ORDER BY last_name, first_name");
                jsonResponse($stmt->fetchAll());
            } else { jsonError('Not found', 404); }
            break;

        default:
            jsonError('Not found', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
