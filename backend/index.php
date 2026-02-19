<?php
/**
 * REST API entry - TRD aligned
 * All routes under /api/ (e.g. /api/students, /api/leads)
 */
define('IS_API', true);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
initDB();

$method = $_SERVER['REQUEST_METHOD'];
$path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
$path = preg_replace('#^api/?(index\.php/?)?#', '', $path);
$segments = $path ? explode('/', $path) : [];
$resource = $segments[0] ?? '';
$id = isset($segments[1]) && ctype_digit($segments[1]) ? (int)$segments[1] : null;
// sub: third segment, or second if it's not a numeric id (e.g. dashboard/stats, reports/payments)
$sub = $segments[2] ?? '';
if ($sub === '' && isset($segments[1]) && !ctype_digit($segments[1])) {
    $sub = $segments[1];
}

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
            $stmt = db()->prepare("SELECT id, username, password, name, role, is_active FROM users WHERE username = ?");
            $stmt->execute([$input['username'] ?? '']);
            $u = $stmt->fetch();
            if (!$u || !password_verify($input['password'] ?? '', $u['password'])) {
                jsonError('Invalid credentials', 401);
                break;
            }
            if (isset($u['is_active']) && ($u['is_active'] === false || $u['is_active'] === 'f' || $u['is_active'] === 0)) {
                jsonError('Account is deactivated. Contact an administrator.', 403);
                break;
            }
            unset($u['password'], $u['is_active']);
            $u['id'] = (int)$u['id'];

            $tokens = generateTokenPair($u);
            setRefreshTokenCookie($tokens['refresh_token']);

            // Update last login
            db()->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$u['id']]);

            // Set jwt_user for activityLog
            $GLOBALS['jwt_user'] = ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role']];
            activityLog('login', 'user', $u['id']);
            jsonResponse([
                'user' => $u,
                'access_token' => $tokens['access_token'],
                'expires_in' => $tokens['expires_in'],
            ]);
            break;

        case 'logout':
            if ($method !== 'POST') { jsonError('Method not allowed', 405); break; }
            // Best-effort: read access token for logging
            $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            if (strpos($header, 'Bearer ') === 0) {
                $payload = jwtDecode(substr($header, 7));
                if ($payload) {
                    $GLOBALS['jwt_user'] = ['id' => (int)$payload['sub'], 'name' => $payload['name'], 'role' => $payload['role']];
                }
            }
            // Revoke refresh token
            $rt = $_COOKIE['refresh_token'] ?? '';
            if ($rt) {
                $hash = hash('sha256', $rt);
                db()->prepare("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL")->execute([$hash]);
            }
            clearRefreshTokenCookie();
            activityLog('logout', 'user', $GLOBALS['jwt_user']['id'] ?? null);
            jsonResponse(['ok' => true]);
            break;

        case 'me':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            $stmt = db()->prepare("SELECT id, username, name, role, teacher_id, email, phone, is_active, last_login FROM users WHERE id = ?");
            $stmt->execute([$GLOBALS['jwt_user']['id']]);
            $meUser = $stmt->fetch();
            if ($meUser) { $meUser['id'] = (int)$meUser['id']; unset($meUser['is_active']); }
            jsonResponse(['user' => $meUser]);
            break;

        case 'refresh':
            if ($method !== 'POST') { jsonError('Method not allowed', 405); break; }
            $rt = $_COOKIE['refresh_token'] ?? '';
            if (!$rt) { http_response_code(401); echo json_encode(['error' => 'No refresh token']); break; }
            $hash = hash('sha256', $rt);
            $stmt = db()->prepare("SELECT rt.*, u.id AS uid, u.username, u.name, u.role, u.is_active FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token_hash = ? AND rt.revoked_at IS NULL");
            $stmt->execute([$hash]);
            $row = $stmt->fetch();
            if (!$row) {
                clearRefreshTokenCookie();
                http_response_code(401);
                echo json_encode(['error' => 'Invalid refresh token']);
                break;
            }
            if (strtotime($row['expires_at']) < time()) {
                db()->prepare("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?")->execute([$row['id']]);
                clearRefreshTokenCookie();
                http_response_code(401);
                echo json_encode(['error' => 'Refresh token expired']);
                break;
            }
            if ($row['is_active'] === false || $row['is_active'] === 'f' || $row['is_active'] === 0) {
                db()->prepare("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?")->execute([$row['id']]);
                clearRefreshTokenCookie();
                http_response_code(403);
                echo json_encode(['error' => 'Account deactivated']);
                break;
            }
            // Rotate: revoke old, issue new
            db()->prepare("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?")->execute([$row['id']]);
            $u = ['id' => (int)$row['uid'], 'username' => $row['username'], 'name' => $row['name'], 'role' => $row['role']];
            $tokens = generateTokenPair($u);
            setRefreshTokenCookie($tokens['refresh_token']);
            jsonResponse([
                'user' => $u,
                'access_token' => $tokens['access_token'],
                'expires_in' => $tokens['expires_in'],
            ]);
            break;

        case 'students':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($id && $method === 'GET') {
                // Single student by ID
                $q = "
                    SELECT s.*,
                        cb.name AS created_by_name,
                        CASE
                            WHEN s.referred_by_type = 'student' THEN (SELECT first_name || ' ' || last_name FROM students WHERE id = s.referred_by_id)
                            WHEN s.referred_by_type = 'teacher' THEN (SELECT first_name || ' ' || last_name FROM teachers WHERE id = s.referred_by_id)
                            WHEN s.referred_by_type = 'user' THEN (SELECT name FROM users WHERE id = s.referred_by_id)
                            ELSE NULL
                        END AS referred_by_name,
                        COALESCE(
                            (SELECT string_agg(g.name, ', ' ORDER BY g.name)
                             FROM enrollments e JOIN groups g ON e.group_id = g.id WHERE e.student_id = s.id), ''
                        ) AS groups_list,
                        COALESCE(
                            (SELECT json_agg(json_build_object('group_id', g.id, 'group_name', g.name, 'price', g.price, 'discount', e.discount_percentage))
                             FROM enrollments e JOIN groups g ON e.group_id = g.id WHERE e.student_id = s.id), '[]'
                        ) AS enrollments_json
                    FROM students s
                    LEFT JOIN users cb ON s.created_by = cb.id
                    WHERE s.id = ? AND s.deleted_at IS NULL
                ";
                $stmt = db()->prepare($q);
                $stmt->execute([$id]);
                $student = $stmt->fetch();
                if (!$student) { jsonError('Student not found', 404); break; }
                $student['enrollments'] = json_decode($student['enrollments_json'], true) ?: [];
                unset($student['enrollments_json']);
                $currentMonth = date('Y-m-01');
                $debtStmt = db()->prepare("
                    SELECT
                        SUM(g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)) AS expected,
                        COALESCE(SUM(
                            (SELECT COALESCE(SUM(pm.amount), 0)
                             FROM payment_months pm JOIN payments p ON pm.payment_id = p.id
                             WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL)
                        ), 0) AS paid
                    FROM enrollments e JOIN groups g ON e.group_id = g.id WHERE e.student_id = ?
                ");
                $debtStmt->execute([$currentMonth, $id]);
                $debtRow = $debtStmt->fetch();
                if ($debtRow) {
                    $expected = (float)$debtRow['expected'];
                    $paid = (float)$debtRow['paid'];
                    $student['current_month_debt'] = round(max(0, $expected - $paid), 2);
                    $student['current_month_expected'] = round($expected, 2);
                    $student['current_month_paid'] = round($paid, 2);
                } else {
                    $student['current_month_debt'] = 0;
                    $student['current_month_expected'] = 0;
                    $student['current_month_paid'] = 0;
                }
                jsonResponse($student);
            } elseif ($method === 'GET') {
                // Build query with optional filters
                $where = ["s.deleted_at IS NULL"];
                $params = [];
                if (!empty($_GET['status'])) {
                    $where[] = "s.status = ?";
                    $params[] = $_GET['status'];
                }
                if (!empty($_GET['search'])) {
                    $s = '%' . $_GET['search'] . '%';
                    $where[] = "(s.first_name ILIKE ? OR s.last_name ILIKE ? OR s.phone ILIKE ? OR s.email ILIKE ?)";
                    $params = array_merge($params, [$s, $s, $s, $s]);
                }
                if (!empty($_GET['group_id'])) {
                    $where[] = "EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.student_id = s.id AND e2.group_id = ?)";
                    $params[] = (int)$_GET['group_id'];
                }
                if (!empty($_GET['source'])) {
                    $where[] = "s.source = ?";
                    $params[] = $_GET['source'];
                }

                $whereClause = 'WHERE ' . implode(' AND ', $where);

                // Get students with aggregated enrollment info
                $q = "
                    SELECT s.*,
                        cb.name AS created_by_name,
                        CASE
                            WHEN s.referred_by_type = 'student' THEN (SELECT first_name || ' ' || last_name FROM students WHERE id = s.referred_by_id)
                            WHEN s.referred_by_type = 'teacher' THEN (SELECT first_name || ' ' || last_name FROM teachers WHERE id = s.referred_by_id)
                            WHEN s.referred_by_type = 'user' THEN (SELECT name FROM users WHERE id = s.referred_by_id)
                            ELSE NULL
                        END AS referred_by_name,
                        COALESCE(
                            (SELECT string_agg(g.name, ', ' ORDER BY g.name)
                             FROM enrollments e
                             JOIN groups g ON e.group_id = g.id
                             WHERE e.student_id = s.id),
                            ''
                        ) AS groups_list,
                        COALESCE(
                            (SELECT json_agg(json_build_object('group_id', g.id, 'group_name', g.name, 'price', g.price, 'discount', e.discount_percentage))
                             FROM enrollments e
                             JOIN groups g ON e.group_id = g.id
                             WHERE e.student_id = s.id),
                            '[]'
                        ) AS enrollments_json
                    FROM students s
                    LEFT JOIN users cb ON s.created_by = cb.id
                    $whereClause
                    ORDER BY s.created_at DESC
                ";
                $stmt = $params ? db()->prepare($q) : db()->query($q);
                if ($params) $stmt->execute($params);
                $students = $stmt->fetchAll();

                // Calculate debt for each student
                $currentMonth = date('Y-m-01');
                $debtStmt = db()->prepare("
                    SELECT
                        e.student_id,
                        SUM(g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)) AS expected,
                        COALESCE(SUM(
                            (SELECT COALESCE(SUM(pm.amount), 0)
                             FROM payment_months pm
                             JOIN payments p ON pm.payment_id = p.id
                             WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL)
                        ), 0) AS paid
                    FROM enrollments e
                    JOIN groups g ON e.group_id = g.id
                    WHERE e.student_id = ?
                    GROUP BY e.student_id
                ");

                foreach ($students as &$student) {
                    // Parse enrollments JSON
                    $student['enrollments'] = json_decode($student['enrollments_json'], true) ?: [];
                    unset($student['enrollments_json']);

                    // Calculate current month debt
                    $debtStmt->execute([$currentMonth, $student['id']]);
                    $debtRow = $debtStmt->fetch();
                    if ($debtRow) {
                        $expected = (float)$debtRow['expected'];
                        $paid = (float)$debtRow['paid'];
                        $student['current_month_debt'] = round(max(0, $expected - $paid), 2);
                        $student['current_month_expected'] = round($expected, 2);
                        $student['current_month_paid'] = round($paid, 2);
                    } else {
                        $student['current_month_debt'] = 0;
                        $student['current_month_expected'] = 0;
                        $student['current_month_paid'] = 0;
                    }
                }
                jsonResponse($students);
            } elseif ($method === 'POST') {
                if (empty($input['source'])) { jsonError('Source is required'); break; }
                $source = $input['source'];
                $referredByType = null;
                $referredById = null;
                if ($source === 'referral') {
                    $referredByType = $input['referred_by_type'] ?? null;
                    $referredById = isset($input['referred_by_id']) ? (int)$input['referred_by_id'] : null;
                }
                $createdBy = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO students (first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes, source, referred_by_type, referred_by_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['dob'] ?? null, $input['phone'] ?? '', $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $input['status'] ?? 'active', $input['notes'] ?? '',
                    $source, $referredByType, $referredById, $createdBy
                ]);
                $id = db()->lastInsertId();
                auditLog('create', 'student', (int)$id, null, [
                    'first_name' => $input['first_name'] ?? '',
                    'last_name' => $input['last_name'] ?? '',
                    'phone' => $input['phone'] ?? '',
                    'email' => $input['email'] ?? '',
                    'status' => $input['status'] ?? 'active',
                    'source' => $source
                ]);
                jsonResponse(['id' => (int)$id]);
            } elseif ($id && $method === 'PUT') {
                $oldStmt = db()->prepare("SELECT first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes, source FROM students WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                $stmt = db()->prepare("UPDATE students SET first_name=?, last_name=?, dob=?, phone=?, email=?, parent_name=?, parent_phone=?, status=?, notes=?, source=? WHERE id=?");
                $newValues = [
                    'first_name' => $input['first_name'] ?? $oldRow['first_name'], 'last_name' => $input['last_name'] ?? $oldRow['last_name'],
                    'dob' => array_key_exists('dob', $input) ? $input['dob'] : $oldRow['dob'], 'phone' => $input['phone'] ?? $oldRow['phone'], 'email' => $input['email'] ?? $oldRow['email'],
                    'parent_name' => $input['parent_name'] ?? $oldRow['parent_name'], 'parent_phone' => $input['parent_phone'] ?? $oldRow['parent_phone'],
                    'status' => $input['status'] ?? $oldRow['status'], 'notes' => $input['notes'] ?? $oldRow['notes'],
                    'source' => $input['source'] ?? $oldRow['source']
                ];
                $stmt->execute(array_merge(array_values($newValues), [$id]));
                auditLog('update', 'student', $id, $oldRow ?: null, $newValues);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                requireRole(['admin']);
                $old = db()->prepare("SELECT id, first_name, last_name, phone, email, status, source, created_at FROM students WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Student not found', 404); break; }
                $oldValues = $oldRow;
                $oldValues['id'] = (int)$oldValues['id'];
                db()->prepare("UPDATE students SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                auditLog('soft_delete', 'student', $id, $oldValues, null);
                activityLog('soft_delete', 'student', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'teachers':
            requireRole(['admin', 'manager', 'accountant']);
            if ($id && $method === 'GET') {
                $stmt = db()->prepare("SELECT * FROM teachers WHERE id = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { jsonError('Teacher not found', 404); break; }
                jsonResponse($row);
            } elseif ($method === 'GET') {
                $stmt = db()->query("SELECT * FROM teachers ORDER BY created_at DESC");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $userId = isset($input['user_id']) ? (int)$input['user_id'] : null;
                if ($userId) {
                    $u = db()->prepare("SELECT id, name FROM users WHERE id = ?");
                    $u->execute([$userId]);
                    $userRow = $u->fetch();
                    if (!$userRow || !trim($userRow['name'] ?? '')) {
                        jsonError('User not found or has no name', 400);
                        break;
                    }
                    $fullName = trim($userRow['name']);
                    $parts = preg_split('/\s+/', $fullName, 2);
                    $firstName = $parts[0] ?? $fullName;
                    $lastName = $parts[1] ?? '';
                    $subjects = $input['subjects'] ?? '';
                    $salaryType = $input['salary_type'] ?? 'fixed';
                    $salaryAmount = (float)($input['salary_amount'] ?? 0);
                    $status = $input['status'] ?? 'active';
                    $stmt = db()->prepare("INSERT INTO teachers (first_name, last_name, phone, email, subjects, salary_type, salary_amount, status) VALUES (?,?,?,?,?,?,?,?)");
                    $stmt->execute([$firstName, $lastName, '', '', $subjects, $salaryType, $salaryAmount, $status]);
                    $teacherId = (int)db()->lastInsertId();
                    try {
                        db()->prepare("UPDATE users SET teacher_id = ? WHERE id = ?")->execute([$teacherId, $userId]);
                    } catch (PDOException $e) { /* ignore if column missing */ }
                    auditLog('create', 'teacher', $teacherId, null, [
                        'first_name' => $firstName, 'last_name' => $lastName,
                        'subjects' => $subjects, 'salary_type' => $salaryType,
                        'salary_amount' => $salaryAmount, 'status' => $status
                    ]);
                    jsonResponse(['id' => $teacherId]);
                } else {
                    jsonError('Select a user with teacher role to add as teacher', 400);
                }
            } elseif ($id && $method === 'PUT') {
                $oldStmt = db()->prepare("SELECT first_name, last_name, phone, email, subjects, salary_type, salary_amount, status FROM teachers WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                $newValues = [
                    'first_name' => $input['first_name'] ?? $oldRow['first_name'], 'last_name' => $input['last_name'] ?? $oldRow['last_name'],
                    'phone' => $input['phone'] ?? $oldRow['phone'], 'email' => $input['email'] ?? $oldRow['email'],
                    'subjects' => $input['subjects'] ?? $oldRow['subjects'], 'salary_type' => $input['salary_type'] ?? $oldRow['salary_type'],
                    'salary_amount' => $input['salary_amount'] ?? $oldRow['salary_amount'], 'status' => $input['status'] ?? $oldRow['status']
                ];
                $stmt = db()->prepare("UPDATE teachers SET first_name=?, last_name=?, phone=?, email=?, subjects=?, salary_type=?, salary_amount=?, status=? WHERE id=?");
                $stmt->execute(array_merge(array_values($newValues), [$id]));
                auditLog('update', 'teacher', $id, $oldRow ?: null, $newValues);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                $oldStmt = db()->prepare("SELECT first_name, last_name, phone, email, subjects, salary_type, salary_amount, status FROM teachers WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                db()->prepare("DELETE FROM teachers WHERE id=?")->execute([$id]);
                auditLog('delete', 'teacher', $id, $oldRow ?: null, null);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'groups':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($id && $method === 'GET') {
                $stmt = db()->prepare("
                    SELECT g.*,
                           TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')) AS teacher_name,
                           COALESCE(e.student_count, 0) AS student_count
                    FROM groups g
                    LEFT JOIN teachers t ON g.teacher_id = t.id
                    LEFT JOIN (
                        SELECT group_id, COUNT(*) AS student_count
                        FROM enrollments
                        GROUP BY group_id
                    ) e ON g.id = e.group_id
                    WHERE g.id = ? AND g.deleted_at IS NULL
                ");
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { jsonError('Group not found', 404); break; }
                jsonResponse($row);
            } elseif ($method === 'GET') {
                $stmt = db()->query("
                    SELECT g.*,
                           TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')) AS teacher_name,
                           COALESCE(e.student_count, 0) AS student_count
                    FROM groups g
                    LEFT JOIN teachers t ON g.teacher_id = t.id
                    LEFT JOIN (
                        SELECT group_id, COUNT(*) AS student_count
                        FROM enrollments
                        GROUP BY group_id
                    ) e ON g.id = e.group_id
                    WHERE g.deleted_at IS NULL
                    ORDER BY g.created_at DESC
                ");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $stmt = db()->prepare("INSERT INTO groups (name, subject, teacher_id, capacity, price, status, schedule_days, schedule_time_start, schedule_time_end, room) VALUES (?,?,?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['name'] ?? '',
                    $input['subject'] ?? '',
                    $input['teacher_id'] ?: null,
                    $input['capacity'] ?? 15,
                    $input['price'] ?? 0,
                    $input['status'] ?? 'active',
                    $input['schedule_days'] ?? null,
                    $input['schedule_time_start'] ?? null,
                    $input['schedule_time_end'] ?? null,
                    $input['room'] ?? null
                ]);
                $groupId = (int)db()->lastInsertId();
                auditLog('create', 'group', $groupId, null, [
                    'name' => $input['name'] ?? '', 'subject' => $input['subject'] ?? '',
                    'teacher_id' => $input['teacher_id'] ?: null, 'capacity' => $input['capacity'] ?? 15,
                    'price' => $input['price'] ?? 0, 'status' => $input['status'] ?? 'active'
                ]);
                jsonResponse(['id' => $groupId]);
            } elseif ($id && $method === 'PUT') {
                $oldStmt = db()->prepare("SELECT name, subject, teacher_id, capacity, price, status, schedule_days, schedule_time_start, schedule_time_end, room FROM groups WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                $newValues = [
                    'name' => $input['name'] ?? $oldRow['name'], 'subject' => $input['subject'] ?? $oldRow['subject'],
                    'teacher_id' => array_key_exists('teacher_id', $input) ? ($input['teacher_id'] ?: null) : $oldRow['teacher_id'],
                    'capacity' => $input['capacity'] ?? $oldRow['capacity'],
                    'price' => $input['price'] ?? $oldRow['price'], 'status' => $input['status'] ?? $oldRow['status']
                ];
                $stmt = db()->prepare("UPDATE groups SET name=?, subject=?, teacher_id=?, capacity=?, price=?, status=?, schedule_days=?, schedule_time_start=?, schedule_time_end=?, room=? WHERE id=?");
                $stmt->execute([
                    $newValues['name'], $newValues['subject'], $newValues['teacher_id'],
                    $newValues['capacity'], $newValues['price'], $newValues['status'],
                    $input['schedule_days'] ?? $oldRow['schedule_days'], $input['schedule_time_start'] ?? $oldRow['schedule_time_start'],
                    $input['schedule_time_end'] ?? $oldRow['schedule_time_end'], $input['room'] ?? $oldRow['room'], $id
                ]);
                auditLog('update', 'group', $id, $oldRow ?: null, $newValues);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                requireRole(['admin']);
                $old = db()->prepare("SELECT id, name, subject, teacher_id, capacity, price, status, created_at FROM groups WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Group not found', 404); break; }
                $oldValues = $oldRow;
                $oldValues['id'] = (int)$oldValues['id'];
                db()->prepare("UPDATE groups SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                auditLog('soft_delete', 'group', $id, $oldValues, null);
                activityLog('soft_delete', 'group', $id);
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
                    $stmt = db()->prepare("SELECT e.*, g.name AS group_name, g.price AS group_price FROM enrollments e JOIN groups g ON e.group_id = g.id WHERE e.student_id = ?");
                    $stmt->execute([$student]);
                } else {
                    $stmt = db()->query("SELECT e.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name FROM enrollments e JOIN students s ON e.student_id = s.id JOIN groups g ON e.group_id = g.id ORDER BY e.enrolled_at DESC");
                }
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $discountPct = isset($input['discount_percentage']) ? max(0, min(100, (float)$input['discount_percentage'])) : 0;
                $enrollStudentId = (int)($input['student_id'] ?? 0);
                $enrollGroupId = (int)($input['group_id'] ?? 0);
                $stmt = db()->prepare("INSERT INTO enrollments (student_id, group_id, discount_percentage) VALUES (?,?,?) ON CONFLICT (student_id, group_id) DO UPDATE SET discount_percentage = EXCLUDED.discount_percentage");
                $stmt->execute([$enrollStudentId, $enrollGroupId, $discountPct]);

                // Notify teacher about new student
                $teacherUserId = getTeacherUserId($enrollGroupId);
                if ($teacherUserId) {
                    $infoStmt = db()->prepare("SELECT s.first_name || ' ' || s.last_name AS sname, g.name AS gname FROM students s, groups g WHERE s.id = ? AND g.id = ?");
                    $infoStmt->execute([$enrollStudentId, $enrollGroupId]);
                    $info = $infoStmt->fetch();
                    if ($info) {
                        createNotification($teacherUserId, 'student_enrolled', "New student in {$info['gname']}", "{$info['sname']} enrolled in {$info['gname']}", "/students/{$enrollStudentId}");
                    }
                }

                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'PUT') {
                $discountPct = isset($input['discount_percentage']) ? max(0, min(100, (float)$input['discount_percentage'])) : null;
                if ($discountPct !== null) {
                    $stmt = db()->prepare("UPDATE enrollments SET discount_percentage = ? WHERE id = ?");
                    $stmt->execute([$discountPct, $id]);
                }
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                // Fetch enrollment details before deleting for notification
                $enrollInfoStmt = db()->prepare("SELECT e.student_id, e.group_id, s.first_name || ' ' || s.last_name AS sname, g.name AS gname FROM enrollments e JOIN students s ON e.student_id = s.id JOIN groups g ON e.group_id = g.id WHERE e.id = ?");
                $enrollInfoStmt->execute([$id]);
                $enrollInfo = $enrollInfoStmt->fetch();

                $stmt = db()->prepare("DELETE FROM enrollments WHERE id = ?");
                $stmt->execute([$id]);

                // Notify teacher about student removal
                if ($enrollInfo) {
                    $teacherUserId = getTeacherUserId((int)$enrollInfo['group_id']);
                    if ($teacherUserId) {
                        createNotification($teacherUserId, 'student_removed', "Student left {$enrollInfo['gname']}", "{$enrollInfo['sname']} was removed from {$enrollInfo['gname']}", "/students/{$enrollInfo['student_id']}");
                    }
                }

                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'group-transfers':
            requireRole(['admin', 'manager']);
            if ($method === 'GET') {
                // Get transfer history - optionally filter by student_id
                $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
                if ($studentId) {
                    $stmt = db()->prepare("
                        SELECT gt.*,
                               fg.name AS from_group_name,
                               tg.name AS to_group_name,
                               s.first_name || ' ' || s.last_name AS student_name,
                               u.name AS transferred_by_name
                        FROM group_transfers gt
                        JOIN groups fg ON gt.from_group_id = fg.id
                        JOIN groups tg ON gt.to_group_id = tg.id
                        JOIN students s ON gt.student_id = s.id
                        LEFT JOIN users u ON gt.transferred_by = u.id
                        WHERE gt.student_id = ?
                        ORDER BY gt.created_at DESC
                    ");
                    $stmt->execute([$studentId]);
                } else {
                    $stmt = db()->query("
                        SELECT gt.*,
                               fg.name AS from_group_name,
                               tg.name AS to_group_name,
                               s.first_name || ' ' || s.last_name AS student_name,
                               u.name AS transferred_by_name
                        FROM group_transfers gt
                        JOIN groups fg ON gt.from_group_id = fg.id
                        JOIN groups tg ON gt.to_group_id = tg.id
                        JOIN students s ON gt.student_id = s.id
                        LEFT JOIN users u ON gt.transferred_by = u.id
                        ORDER BY gt.created_at DESC
                        LIMIT 100
                    ");
                }
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                // Transfer student from one group to another
                $studentId = (int)($input['student_id'] ?? 0);
                $fromGroupId = (int)($input['from_group_id'] ?? 0);
                $toGroupId = (int)($input['to_group_id'] ?? 0);
                $reason = $input['reason'] ?? null;
                $discountPct = isset($input['discount_percentage']) ? max(0, min(100, (float)$input['discount_percentage'])) : 0;

                if (!$studentId || !$fromGroupId || !$toGroupId) {
                    jsonError('student_id, from_group_id, and to_group_id are required');
                }
                if ($fromGroupId === $toGroupId) {
                    jsonError('Source and target groups must be different');
                }

                // Check student is enrolled in source group
                $checkStmt = db()->prepare("SELECT id, discount_percentage FROM enrollments WHERE student_id = ? AND group_id = ?");
                $checkStmt->execute([$studentId, $fromGroupId]);
                $enrollment = $checkStmt->fetch();
                if (!$enrollment) {
                    jsonError('Student is not enrolled in the source group');
                }

                // Check student is not already in target group
                $checkStmt2 = db()->prepare("SELECT id FROM enrollments WHERE student_id = ? AND group_id = ?");
                $checkStmt2->execute([$studentId, $toGroupId]);
                if ($checkStmt2->fetch()) {
                    jsonError('Student is already enrolled in the target group');
                }

                // Check if student has paid for current month in the source group
                $currentMonth = date('Y-m-01');
                $paidStmt = db()->prepare("
                    SELECT COALESCE(SUM(pm.amount), 0) AS paid
                    FROM payment_months pm
                    JOIN payments p ON pm.payment_id = p.id
                    WHERE p.student_id = ? AND p.group_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL
                ");
                $paidStmt->execute([$studentId, $fromGroupId, $currentMonth]);
                $paidAmount = (float)$paidStmt->fetchColumn();

                // Get source group price to check if fully paid
                $groupStmt = db()->prepare("SELECT price FROM groups WHERE id = ?");
                $groupStmt->execute([$fromGroupId]);
                $sourceGroupPrice = (float)$groupStmt->fetchColumn();
                $sourceDiscount = (float)$enrollment['discount_percentage'];
                $expectedPayment = $sourceGroupPrice * (1 - $sourceDiscount / 100);

                $paidMonth = null;
                if ($paidAmount >= $expectedPayment * 0.5) { // At least 50% paid = consider it paid
                    $paidMonth = $currentMonth;
                }

                // Calculate total unpaid debt in source group (all months with outstanding balance)
                $debtStmt = db()->prepare("
                    SELECT COALESCE(SUM(expected - paid), 0) AS total_debt
                    FROM (
                        SELECT
                            CAST(:exp_payment AS numeric) AS expected,
                            COALESCE((
                                SELECT SUM(pm2.amount)
                                FROM payment_months pm2
                                JOIN payments p2 ON pm2.payment_id = p2.id
                                WHERE p2.student_id = :sid AND p2.group_id = :gid
                                  AND pm2.for_month = gs.month_start
                                  AND p2.deleted_at IS NULL
                            ), 0) AS paid
                        FROM generate_series(
                            (SELECT COALESCE(MIN(enrolled_at), CURRENT_DATE) FROM enrollments WHERE student_id = :sid2 AND group_id = :gid2),
                            date_trunc('month', CURRENT_DATE)::DATE,
                            '1 month'::interval
                        ) AS gs(month_start)
                    ) debt_calc
                    WHERE expected > paid
                ");
                $debtStmt->execute([
                    ':exp_payment' => $expectedPayment,
                    ':sid' => $studentId, ':gid' => $fromGroupId,
                    ':sid2' => $studentId, ':gid2' => $fromGroupId
                ]);
                $sourceGroupDebt = (float)$debtStmt->fetchColumn();

                // Start transaction
                db()->beginTransaction();
                try {
                    // Remove from source group
                    $delStmt = db()->prepare("DELETE FROM enrollments WHERE student_id = ? AND group_id = ?");
                    $delStmt->execute([$studentId, $fromGroupId]);

                    // Add to target group
                    $addStmt = db()->prepare("INSERT INTO enrollments (student_id, group_id, discount_percentage) VALUES (?, ?, ?)");
                    $addStmt->execute([$studentId, $toGroupId, $discountPct]);

                    // Record transfer history
                    $userId = $GLOBALS['jwt_user']['id'] ?? null;
                    $histStmt = db()->prepare("
                        INSERT INTO group_transfers (student_id, from_group_id, to_group_id, reason, paid_month, discount_percentage, transferred_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ");
                    $histStmt->execute([$studentId, $fromGroupId, $toGroupId, $reason, $paidMonth, $discountPct, $userId]);

                    // If student paid for current month, create a payment record for the new group
                    // to mark this month as paid (amount = 0, just a marker)
                    if ($paidMonth) {
                        // Insert a "transfer credit" payment
                        $creditStmt = db()->prepare("
                            INSERT INTO payments (student_id, group_id, amount, payment_date, method, notes)
                            VALUES (?, ?, 0, CURRENT_DATE, 'transfer', ?)
                        ");
                        $creditStmt->execute([$studentId, $toGroupId, 'Transfer credit from ' . $fromGroupId . ' - month already paid']);
                        $creditPaymentId = db()->lastInsertId();

                        // Get target group price for the payment_months record
                        $tgtStmt = db()->prepare("SELECT price FROM groups WHERE id = ?");
                        $tgtStmt->execute([$toGroupId]);
                        $targetGroupPrice = (float)$tgtStmt->fetchColumn();
                        $targetMonthlyRate = $targetGroupPrice * (1 - $discountPct / 100);

                        // Mark current month as paid in target group
                        $pmStmt = db()->prepare("INSERT INTO payment_months (payment_id, for_month, amount) VALUES (?, ?, ?)");
                        $pmStmt->execute([$creditPaymentId, $paidMonth, $targetMonthlyRate]);
                    }

                    db()->commit();

                    // Notify teachers about the transfer
                    $transferStudentStmt = db()->prepare("SELECT first_name || ' ' || last_name AS sname FROM students WHERE id = ?");
                    $transferStudentStmt->execute([$studentId]);
                    $transferStudentName = $transferStudentStmt->fetchColumn();
                    $fromGroupStmt = db()->prepare("SELECT name FROM groups WHERE id = ?");
                    $fromGroupStmt->execute([$fromGroupId]);
                    $fromGroupName = $fromGroupStmt->fetchColumn();
                    $toGroupStmt = db()->prepare("SELECT name FROM groups WHERE id = ?");
                    $toGroupStmt->execute([$toGroupId]);
                    $toGroupName = $toGroupStmt->fetchColumn();

                    // Notify old group teacher (student removed)
                    $oldTeacherUserId = getTeacherUserId($fromGroupId);
                    if ($oldTeacherUserId) {
                        createNotification($oldTeacherUserId, 'student_removed', "Student left {$fromGroupName}", "{$transferStudentName} was transferred to {$toGroupName}", "/students/{$studentId}");
                    }
                    // Notify new group teacher (student enrolled)
                    $newTeacherUserId = getTeacherUserId($toGroupId);
                    if ($newTeacherUserId && $newTeacherUserId !== $oldTeacherUserId) {
                        createNotification($newTeacherUserId, 'student_enrolled', "New student in {$toGroupName}", "{$transferStudentName} transferred from {$fromGroupName}", "/students/{$studentId}");
                    }

                    $message = $paidMonth ? 'Student transferred. Current month payment credited to new group.' : 'Student transferred successfully.';
                    if ($sourceGroupDebt > 0) {
                        $message .= ' Warning: Student had ' . number_format($sourceGroupDebt, 2) . ' unpaid debt in the source group.';
                    }

                    jsonResponse([
                        'ok' => true,
                        'paid_month_transferred' => $paidMonth !== null,
                        'source_group_debt' => $sourceGroupDebt,
                        'message' => $message
                    ]);
                } catch (Exception $e) {
                    db()->rollBack();
                    jsonError('Transfer failed: ' . $e->getMessage());
                }
            } else { jsonError('Not found', 404); }
            break;

        case 'payments':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                // Include months_covered for each payment
                $where = [];
                $params = [];
                if (!empty($_GET['student_id'])) {
                    $where[] = "p.student_id = ?";
                    $params[] = (int)$_GET['student_id'];
                }
                $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
                $q = "
                    SELECT p.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name
                    FROM payments p
                    JOIN students s ON p.student_id = s.id
                    LEFT JOIN groups g ON p.group_id = g.id
                    $whereClause
                    ORDER BY p.created_at DESC LIMIT 500
                ";
                $stmt = $params ? db()->prepare($q) : db()->query($q);
                if ($params) $stmt->execute($params);
                $payments = $stmt->fetchAll();
                // Fetch months for all payments
                $paymentIds = array_column($payments, 'id');
                $monthsMap = [];
                if ($paymentIds) {
                    $placeholders = implode(',', array_fill(0, count($paymentIds), '?'));
                    $monthsStmt = db()->prepare("SELECT payment_id, for_month, amount FROM payment_months WHERE payment_id IN ($placeholders) ORDER BY for_month");
                    $monthsStmt->execute($paymentIds);
                    foreach ($monthsStmt->fetchAll() as $row) {
                        $monthsMap[$row['payment_id']][] = ['month' => substr($row['for_month'], 0, 7), 'amount' => (float)$row['amount']];
                    }
                }
                foreach ($payments as &$p) {
                    $p['months_covered'] = $monthsMap[$p['id']] ?? [];
                }
                jsonResponse($payments);
            } elseif ($method === 'POST') {
                $studentId = (int)($input['student_id'] ?? 0);
                $groupId = $input['group_id'] ? (int)$input['group_id'] : null;
                $amount = (float)($input['amount'] ?? 0);
                $paymentDate = $input['payment_date'] ?? date('Y-m-d');
                $method_pay = $input['method'] ?? 'cash';
                $notes = $input['notes'] ?? '';
                $months = $input['months'] ?? []; // array of YYYY-MM strings

                // Validate months and calculate allowed amount
                if ($groupId && !empty($months)) {
                    // Get enrollment info
                    $enrollStmt = db()->prepare("
                        SELECT e.discount_percentage, g.price AS group_price
                        FROM enrollments e
                        JOIN groups g ON e.group_id = g.id
                        WHERE e.student_id = ? AND e.group_id = ?
                    ");
                    $enrollStmt->execute([$studentId, $groupId]);
                    $enrollment = $enrollStmt->fetch();
                    if ($enrollment) {
                        $groupPrice = (float)$enrollment['group_price'];
                        $discountPct = (float)$enrollment['discount_percentage'];
                        $monthlyDebt = $groupPrice * (1 - $discountPct / 100);

                        // Calculate total remaining debt for selected months
                        $totalRemainingDebt = 0;
                        foreach ($months as $m) {
                            $monthStart = $m . '-01';
                            $paidStmt = db()->prepare("
                                SELECT COALESCE(SUM(pm.amount), 0) AS paid
                                FROM payment_months pm
                                JOIN payments p ON pm.payment_id = p.id
                                WHERE p.student_id = ? AND p.group_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL
                            ");
                            $paidStmt->execute([$studentId, $groupId, $monthStart]);
                            $paidForMonth = (float)$paidStmt->fetchColumn();
                            $totalRemainingDebt += max(0, $monthlyDebt - $paidForMonth);
                        }

                        // Validate amount doesn't exceed debt
                        if ($amount > $totalRemainingDebt + 0.01) {
                            jsonError("Amount ({$amount}) exceeds remaining debt ({$totalRemainingDebt}) for selected months", 400);
                            break;
                        }
                    }
                }

                $newPayload = [
                    'student_id' => $studentId,
                    'group_id' => $groupId,
                    'amount' => $amount,
                    'payment_date' => $paymentDate,
                    'method' => $method_pay,
                    'notes' => $notes
                ];
                $stmt = db()->prepare("INSERT INTO payments (student_id, group_id, amount, payment_date, method, notes) VALUES (?,?,?,?,?,?)");
                $stmt->execute([
                    $newPayload['student_id'], $newPayload['group_id'], $newPayload['amount'], $newPayload['payment_date'], $newPayload['method'], $newPayload['notes']
                ]);
                $pid = db()->lastInsertId();
                $invNo = 'INV-' . date('Ymd') . '-' . str_pad($pid, 4, '0', STR_PAD_LEFT);
                try { db()->prepare("INSERT INTO payment_invoices (payment_id, invoice_no) VALUES (?,?)")->execute([$pid, $invNo]); } catch (Exception $e) {}

                // Insert payment_months entries
                if (!empty($months) && $groupId) {
                    // Distribute amount across months proportionally based on remaining debt
                    $enrollStmt = db()->prepare("
                        SELECT e.discount_percentage, g.price AS group_price
                        FROM enrollments e
                        JOIN groups g ON e.group_id = g.id
                        WHERE e.student_id = ? AND e.group_id = ?
                    ");
                    $enrollStmt->execute([$studentId, $groupId]);
                    $enrollment = $enrollStmt->fetch();
                    if ($enrollment) {
                        $groupPrice = (float)$enrollment['group_price'];
                        $discountPct = (float)$enrollment['discount_percentage'];
                        $monthlyDebt = $groupPrice * (1 - $discountPct / 100);

                        $remainingAmount = $amount;
                        $monthInsert = db()->prepare("INSERT INTO payment_months (payment_id, for_month, amount) VALUES (?, ?, ?)");
                        foreach ($months as $m) {
                            if ($remainingAmount <= 0) break;
                            $monthStart = $m . '-01';
                            $paidStmt = db()->prepare("
                                SELECT COALESCE(SUM(pm.amount), 0) AS paid
                                FROM payment_months pm
                                JOIN payments p ON pm.payment_id = p.id
                                WHERE p.student_id = ? AND p.group_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL
                            ");
                            $paidStmt->execute([$studentId, $groupId, $monthStart]);
                            $paidForMonth = (float)$paidStmt->fetchColumn();
                            $debtForMonth = max(0, $monthlyDebt - $paidForMonth);
                            $payForMonth = min($remainingAmount, $debtForMonth);
                            if ($payForMonth > 0) {
                                $monthInsert->execute([$pid, $monthStart, $payForMonth]);
                                $remainingAmount -= $payForMonth;
                            }
                        }
                    }
                } elseif (empty($months)) {
                    // No months specified - assign to payment date month (backward compatibility)
                    $monthStart = date('Y-m-01', strtotime($paymentDate));
                    try {
                        db()->prepare("INSERT INTO payment_months (payment_id, for_month, amount) VALUES (?, ?, ?)")->execute([$pid, $monthStart, $amount]);
                    } catch (Exception $e) {}
                }

                $newPayload['id'] = (int)$pid;
                auditLog('create', 'payment', (int)$pid, null, $newPayload);
                activityLog('create', 'payment', $pid);
                jsonResponse(['id' => (int)$pid, 'invoice_no' => $invNo]);
            } elseif ($id && $method === 'PUT') {
                $old = db()->prepare("SELECT id, student_id, group_id, amount, payment_date, method, notes FROM payments WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Payment not found', 404); break; }
                $oldValues = [
                    'student_id' => (int)$oldRow['student_id'],
                    'group_id' => $oldRow['group_id'] !== null ? (int)$oldRow['group_id'] : null,
                    'amount' => (float)$oldRow['amount'],
                    'payment_date' => $oldRow['payment_date'],
                    'method' => $oldRow['method'],
                    'notes' => (string)$oldRow['notes']
                ];
                $newValues = [
                    'student_id' => (int)($input['student_id'] ?? $oldRow['student_id']),
                    'group_id' => isset($input['group_id']) ? ($input['group_id'] ? (int)$input['group_id'] : null) : $oldValues['group_id'],
                    'amount' => (float)($input['amount'] ?? $oldRow['amount']),
                    'payment_date' => $input['payment_date'] ?? $oldRow['payment_date'],
                    'method' => $input['method'] ?? $oldRow['method'],
                    'notes' => $input['notes'] ?? $oldRow['notes']
                ];
                db()->prepare("UPDATE payments SET student_id=?, group_id=?, amount=?, payment_date=?, method=?, notes=? WHERE id=?")
                    ->execute([$newValues['student_id'], $newValues['group_id'], $newValues['amount'], $newValues['payment_date'], $newValues['method'], $newValues['notes'], $id]);
                auditLog('update', 'payment', (int)$id, $oldValues, $newValues);
                activityLog('update', 'payment', $id);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                requireRole(['admin']);
                $old = db()->prepare("SELECT id, student_id, group_id, amount, payment_date, method, notes FROM payments WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Payment not found', 404); break; }
                db()->prepare("UPDATE payments SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                auditLog('soft_delete', 'payment', (int)$id, ['deleted_at' => null], ['deleted_at' => date('Y-m-d H:i:s')]);
                activityLog('soft_delete', 'payment', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'discounts':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $paymentId = isset($_GET['payment_id']) ? (int)$_GET['payment_id'] : null;
                $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
                if ($paymentId) {
                    $stmt = db()->prepare("SELECT d.* FROM discounts d WHERE d.payment_id = ? ORDER BY d.created_at DESC");
                    $stmt->execute([$paymentId]);
                } elseif ($studentId) {
                    $stmt = db()->prepare("SELECT d.*, p.amount AS payment_amount FROM discounts d JOIN payments p ON d.payment_id = p.id WHERE d.student_id = ? AND p.deleted_at IS NULL ORDER BY d.created_at DESC");
                    $stmt->execute([$studentId]);
                } else {
                    $stmt = db()->query("SELECT d.*, p.student_id, p.amount AS payment_amount FROM discounts d JOIN payments p ON d.payment_id = p.id WHERE p.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 500");
                }
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                if (empty($input['payment_id'])) { jsonError('payment_id is required', 400); break; }
                $newPayload = [
                    'payment_id' => (int)$input['payment_id'],
                    'student_id' => isset($input['student_id']) ? (int)$input['student_id'] : null,
                    'discount_type' => $input['discount_type'] ?? 'fixed',
                    'amount' => (float)($input['amount'] ?? 0),
                    'reason' => $input['reason'] ?? ''
                ];
                $stmt = db()->prepare("INSERT INTO discounts (payment_id, student_id, discount_type, amount, reason) VALUES (?,?,?,?,?)");
                $stmt->execute([$newPayload['payment_id'], $newPayload['student_id'], $newPayload['discount_type'], $newPayload['amount'], $newPayload['reason']]);
                $did = db()->lastInsertId();
                $newPayload['id'] = (int)$did;
                auditLog('create', 'discount', (int)$did, null, $newPayload);
                jsonResponse(['id' => (int)$did]);
            } elseif ($id && $method === 'PUT') {
                $old = db()->prepare("SELECT id, payment_id, student_id, discount_type, amount, reason FROM discounts WHERE id = ?");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Discount not found', 404); break; }
                $oldValues = [
                    'payment_id' => (int)$oldRow['payment_id'],
                    'student_id' => $oldRow['student_id'] !== null ? (int)$oldRow['student_id'] : null,
                    'discount_type' => $oldRow['discount_type'],
                    'amount' => (float)$oldRow['amount'],
                    'reason' => (string)$oldRow['reason']
                ];
                $newValues = [
                    'payment_id' => (int)($input['payment_id'] ?? $oldRow['payment_id']),
                    'student_id' => isset($input['student_id']) ? ($input['student_id'] ? (int)$input['student_id'] : null) : $oldValues['student_id'],
                    'discount_type' => $input['discount_type'] ?? $oldRow['discount_type'],
                    'amount' => (float)($input['amount'] ?? $oldRow['amount']),
                    'reason' => $input['reason'] ?? $oldRow['reason']
                ];
                db()->prepare("UPDATE discounts SET payment_id=?, student_id=?, discount_type=?, amount=?, reason=? WHERE id=?")
                    ->execute([$newValues['payment_id'], $newValues['student_id'], $newValues['discount_type'], $newValues['amount'], $newValues['reason'], $id]);
                auditLog('update', 'discount', (int)$id, $oldValues, $newValues);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                $old = db()->prepare("SELECT id, payment_id, student_id, discount_type, amount, reason FROM discounts WHERE id = ?");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Discount not found', 404); break; }
                $oldValues = [
                    'payment_id' => (int)$oldRow['payment_id'],
                    'student_id' => $oldRow['student_id'] !== null ? (int)$oldRow['student_id'] : null,
                    'discount_type' => $oldRow['discount_type'],
                    'amount' => (float)$oldRow['amount'],
                    'reason' => (string)$oldRow['reason']
                ];
                db()->prepare("DELETE FROM discounts WHERE id = ?")->execute([$id]);
                auditLog('delete', 'discount', (int)$id, $oldValues, null);
                jsonResponse(['ok' => true]);
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
            } elseif ($id && $method === 'DELETE') {
                requireRole(['admin']);
                $old = db()->prepare("SELECT id FROM expenses WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                if (!$old->fetch()) { jsonError('Expense not found', 404); break; }
                db()->prepare("UPDATE expenses SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                activityLog('soft_delete', 'expense', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'leads':
            requireRole(['admin', 'manager']);
            if ($id && $sub === 'interactions' && $method === 'GET') {
                $stmt = db()->prepare("SELECT li.*, u.name AS created_by_name FROM lead_interactions li LEFT JOIN users u ON li.created_by = u.id WHERE li.lead_id = ? ORDER BY li.created_at DESC");
                $stmt->execute([$id]);
                jsonResponse($stmt->fetchAll());
            } elseif ($id && $sub === 'interactions' && $method === 'POST') {
                $userId = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO lead_interactions (lead_id, type, notes, scheduled_at, completed_at, created_by) VALUES (?,?,?,?,?,?)");
                $stmt->execute([
                    $id, $input['type'] ?? 'note', $input['notes'] ?? '',
                    $input['scheduled_at'] ?? null, $input['completed_at'] ?? null, $userId
                ]);
                db()->prepare("UPDATE leads SET last_contact_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);
                jsonResponse(['id' => (int)db()->lastInsertId()]);
            } elseif ($method === 'GET') {
                try {
                    $stmt = db()->query("
                        SELECT l.*, g.name AS trial_group_name,
                            (SELECT COUNT(*) FROM lead_interactions WHERE lead_id = l.id) AS interaction_count
                        FROM leads l
                        LEFT JOIN groups g ON l.trial_group_id = g.id
                        WHERE l.deleted_at IS NULL
                        ORDER BY
                            CASE WHEN l.status IN ('enrolled', 'lost') THEN 1 ELSE 0 END,
                            CASE l.priority WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
                            l.follow_up_date ASC NULLS LAST,
                            l.created_at DESC
                    ");
                    jsonResponse($stmt->fetchAll());
                } catch (PDOException $e) {
                    // Fallback for old schema
                    try {
                        $stmt = db()->query("SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY created_at DESC");
                        jsonResponse($stmt->fetchAll());
                    } catch (PDOException $e2) {
                        jsonResponse([]);
                    }
                }
            } elseif ($id && $sub === 'convert' && $method === 'POST') {
                db()->beginTransaction();
                try {
                    $lead = db()->prepare("SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL AND converted_student_id IS NULL FOR UPDATE");
                    $lead->execute([$id]);
                    $l = $lead->fetch();
                    if (!$l) {
                        db()->rollBack();
                        jsonError('Lead not found or already converted', 404);
                        break;
                    }
                    $createdBy = $GLOBALS['jwt_user']['id'] ?? null;
                    $stmt = db()->prepare("INSERT INTO students (first_name, last_name, phone, email, parent_name, parent_phone, status, notes, source, referred_by_type, referred_by_id, lead_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
                    $stmt->execute([
                        $l['first_name'], $l['last_name'], $l['phone'], $l['email'], $l['parent_name'], $l['parent_phone'],
                        'active', $l['notes'], $l['source'] ?? 'walk_in', $l['referred_by_type'], $l['referred_by_id'], $id, $createdBy
                    ]);
                    $sid = db()->lastInsertId();
                    db()->prepare("UPDATE leads SET status='enrolled', converted_student_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$sid, $id]);
                    db()->commit();
                    activityLog('lead_convert', 'lead', $id);
                    jsonResponse(['student_id' => (int)$sid]);
                } catch (Exception $e) {
                    db()->rollBack();
                    jsonError('Conversion failed: ' . $e->getMessage());
                }
            } elseif ($method === 'POST') {
                if (empty($input['source'])) { jsonError('Source is required'); break; }
                $source = $input['source'];
                $referredByType = null;
                $referredById = null;
                if ($source === 'referral') {
                    $referredByType = $input['referred_by_type'] ?? null;
                    $referredById = isset($input['referred_by_id']) ? (int)$input['referred_by_id'] : null;
                }
                $createdBy = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO leads (first_name, last_name, phone, email, parent_name, parent_phone, source, status, notes, follow_up_date, priority, interested_courses, trial_date, trial_group_id, birth_year, preferred_schedule, budget, created_by, referred_by_type, referred_by_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['phone'] ?? '', $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $source, $input['status'] ?? 'new',
                    $input['notes'] ?? '', $input['follow_up_date'] ?? null, $input['priority'] ?? 'warm',
                    $input['interested_courses'] ?? '', $input['trial_date'] ?? null, $input['trial_group_id'] ?? null,
                    $input['birth_year'] ?? null, $input['preferred_schedule'] ?? '', $input['budget'] ?? '',
                    $createdBy, $referredByType, $referredById
                ]);
                $leadId = (int)db()->lastInsertId();
                auditLog('create', 'lead', $leadId, null, [
                    'first_name' => $input['first_name'] ?? '', 'last_name' => $input['last_name'] ?? '',
                    'phone' => $input['phone'] ?? '', 'source' => $source,
                    'status' => $input['status'] ?? 'new', 'priority' => $input['priority'] ?? 'warm'
                ]);
                jsonResponse(['id' => $leadId]);
            } elseif ($id && $method === 'PUT') {
                // Build dynamic update based on provided fields
                $fields = ['first_name', 'last_name', 'phone', 'email', 'parent_name', 'parent_phone', 'source', 'status', 'notes', 'follow_up_date', 'priority', 'interested_courses', 'trial_date', 'trial_group_id', 'birth_year', 'preferred_schedule', 'budget', 'loss_reason', 'last_contact_date', 'referred_by_type', 'referred_by_id'];
                $updates = [];
                $values = [];
                foreach ($fields as $f) {
                    if (array_key_exists($f, $input)) {
                        $updates[] = "$f = ?";
                        $values[] = $input[$f];
                    }
                }
                if (empty($updates)) { jsonError('No fields to update'); break; }
                $oldStmt = db()->prepare("SELECT first_name, last_name, phone, source, status, priority FROM leads WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                $updates[] = "updated_at = CURRENT_TIMESTAMP";
                $values[] = $id;
                $sql = "UPDATE leads SET " . implode(', ', $updates) . " WHERE id = ?";
                db()->prepare($sql)->execute($values);
                $newStmt = db()->prepare("SELECT first_name, last_name, phone, source, status, priority FROM leads WHERE id = ?");
                $newStmt->execute([$id]);
                $newRow = $newStmt->fetch();
                auditLog('update', 'lead', $id, $oldRow ?: null, $newRow ?: null);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                $old = db()->prepare("SELECT id, first_name, last_name, phone, source, status, priority, created_at FROM leads WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Lead not found', 404); break; }
                $oldValues = $oldRow;
                $oldValues['id'] = (int)$oldValues['id'];
                db()->prepare("UPDATE leads SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                auditLog('soft_delete', 'lead', $id, $oldValues, null);
                activityLog('soft_delete', 'lead', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'lead-stats':
            requireRole(['admin', 'manager']);
            if ($method === 'GET') {
                try {
                    $stats = [];
                    // Total by status
                    $stmt = db()->query("SELECT status, COUNT(*) as count FROM leads WHERE deleted_at IS NULL GROUP BY status");
                    $byStatus = [];
                    while ($row = $stmt->fetch()) {
                        $byStatus[$row['status']] = (int)$row['count'];
                    }
                    $stats['by_status'] = $byStatus;
                    // Follow-ups due today
                    $stmt = db()->query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND follow_up_date = CURRENT_DATE AND status NOT IN ('enrolled', 'lost')");
                    $stats['follow_ups_today'] = (int)$stmt->fetchColumn();
                    // Follow-ups overdue
                    $stmt = db()->query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND follow_up_date < CURRENT_DATE AND status NOT IN ('enrolled', 'lost')");
                    $stats['follow_ups_overdue'] = (int)$stmt->fetchColumn();
                    // Trials scheduled
                    $stmt = db()->query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND trial_date IS NOT NULL AND trial_date >= CURRENT_DATE AND status NOT IN ('enrolled', 'lost')");
                    $stats['trials_scheduled'] = (int)$stmt->fetchColumn();
                    // Hot leads
                    $stmt = db()->query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND priority = 'hot' AND status NOT IN ('enrolled', 'lost')");
                    $stats['hot_leads'] = (int)$stmt->fetchColumn();
                    // This month conversions
                    $stmt = db()->query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND status = 'enrolled' AND date_trunc('month', updated_at) = date_trunc('month', CURRENT_DATE)");
                    $stats['conversions_this_month'] = (int)$stmt->fetchColumn();
                    // By source
                    $stmt = db()->query("SELECT source, COUNT(*) as count FROM leads WHERE deleted_at IS NULL AND source IS NOT NULL AND source != '' GROUP BY source ORDER BY count DESC LIMIT 5");
                    $stats['by_source'] = $stmt->fetchAll();
                    jsonResponse($stats);
                } catch (PDOException $e) {
                    jsonResponse(['by_status' => [], 'follow_ups_today' => 0, 'follow_ups_overdue' => 0, 'trials_scheduled' => 0, 'hot_leads' => 0, 'conversions_this_month' => 0, 'by_source' => []]);
                }
            } else { jsonError('Method not allowed', 405); }
            break;

        case 'referrers':
            requireRole(['admin', 'manager']);
            if ($method === 'GET') {
                $type = $_GET['type'] ?? '';
                $results = [];
                if ($type === 'student') {
                    $stmt = db()->query("SELECT id, first_name || ' ' || last_name AS name FROM students WHERE status = 'active' AND deleted_at IS NULL ORDER BY first_name, last_name");
                    $results = $stmt->fetchAll();
                } elseif ($type === 'teacher') {
                    $stmt = db()->query("SELECT id, first_name || ' ' || last_name AS name FROM teachers WHERE status = 'active' ORDER BY first_name, last_name");
                    $results = $stmt->fetchAll();
                } elseif ($type === 'user') {
                    $stmt = db()->query("SELECT id, name FROM users WHERE is_active = true ORDER BY name");
                    $results = $stmt->fetchAll();
                } else {
                    jsonError('type parameter required (student, teacher, or user)');
                    break;
                }
                jsonResponse($results);
            } else { jsonError('Method not allowed', 405); }
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
                if ($date > date('Y-m-d')) {
                    jsonError('Cannot save attendance for future dates');
                    break;
                }
                $group = (int)($input['group_id'] ?? 0);
                $rows = $input['rows'] ?? [];
                $fetchOld = db()->prepare("SELECT id, student_id, group_id, attendance_date, status FROM attendance WHERE student_id = ? AND group_id = ? AND attendance_date = ?");
                foreach ($rows as $r) {
                    $sid = (int)($r['student_id'] ?? 0);
                    $status = $r['status'] ?? 'present';
                    if (!$sid || !$group) continue;
                    $fetchOld->execute([$sid, $group, $date]);
                    $oldRow = $fetchOld->fetch();
                    db()->prepare("INSERT INTO attendance (student_id, group_id, attendance_date, status) VALUES (?,?,?,?) ON CONFLICT (student_id, group_id, attendance_date) DO UPDATE SET status = ?")
                        ->execute([$sid, $group, $date, $status, $status]);
                    $oldStatus = $oldRow ? $oldRow['status'] : null;
                    if ($oldStatus !== $status) {
                        $attendanceId = $oldRow ? (int)$oldRow['id'] : 0;
                        if (!$attendanceId) {
                            $getId = db()->prepare("SELECT id FROM attendance WHERE student_id = ? AND group_id = ? AND attendance_date = ?");
                            $getId->execute([$sid, $group, $date]);
                            $attendanceId = (int)$getId->fetchColumn();
                        }
                        $oldValues = $oldRow ? ['student_id' => (int)$oldRow['student_id'], 'group_id' => (int)$oldRow['group_id'], 'attendance_date' => $oldRow['attendance_date'], 'status' => $oldRow['status']] : null;
                        $newValues = ['student_id' => $sid, 'group_id' => $group, 'attendance_date' => $date, 'status' => $status];
                        auditLog($oldStatus === null ? 'create' : 'update', 'attendance', $attendanceId, $oldValues, $newValues);
                    }
                }
                activityLog('attendance_save', 'attendance', null, json_encode(['date' => $date, 'group_id' => $group]));
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'teacher-salary-preview':
            // Preview calculated salary for a teacher in a given month
            requireRole(['admin', 'accountant']);
            if ($method === 'GET') {
                $tid = (int)($_GET['teacher_id'] ?? 0);
                $month = $_GET['month'] ?? ''; // Format: YYYY-MM
                if (!$tid || !$month) {
                    jsonError('teacher_id and month required');
                }
                $monthStart = $month . '-01';
                try {
                    $tstmt = db()->prepare("SELECT salary_type, salary_amount FROM teachers WHERE id = ?");
                    $tstmt->execute([$tid]);
                    $t = $tstmt->fetch();
                    if (!$t) {
                        jsonError('Teacher not found', 404);
                    }
                    $salaryType = $t['salary_type'] ?? 'fixed';
                    $salaryAmount = (float)($t['salary_amount'] ?? 0);
                    $baseAmount = 0;
                    $collectedAmount = 0;

                    if ($salaryType === 'fixed') {
                        $baseAmount = $salaryAmount;
                    } elseif ($salaryType === 'per_student') {
                        // Calculate from collected payments for this teacher's groups in the month
                        $paidStmt = db()->prepare("
                            SELECT COALESCE(SUM(pm.amount), 0) AS paid
                            FROM payment_months pm
                            JOIN payments p ON pm.payment_id = p.id
                            JOIN groups g ON p.group_id = g.id
                            WHERE g.teacher_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL
                        ");
                        $paidStmt->execute([$tid, $monthStart]);
                        $collectedAmount = (float)$paidStmt->fetchColumn();
                        if ($collectedAmount > 0 && $salaryAmount > 0) {
                            $baseAmount = $collectedAmount * ($salaryAmount / 100);
                        }
                    }
                    jsonResponse([
                        'teacher_id' => $tid,
                        'month' => $month,
                        'salary_type' => $salaryType,
                        'salary_percentage' => $salaryAmount,
                        'collected_amount' => round($collectedAmount, 2),
                        'base_amount' => round($baseAmount, 2)
                    ]);
                } catch (Exception $e) {
                    jsonError('Error calculating salary: ' . $e->getMessage());
                }
            } else { jsonError('Method not allowed', 405); }
            break;

        case 'salary-slips':
            requireRole(['admin', 'accountant']);
            if ($method === 'GET') {
                $stmt = db()->query("SELECT sl.*, TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')) AS teacher_name FROM salary_slips sl JOIN teachers t ON sl.teacher_id = t.id WHERE sl.deleted_at IS NULL ORDER BY sl.period_end DESC LIMIT 200");
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $tid = (int)($input['teacher_id'] ?? 0);
                $start = $input['period_start'] ?? '';
                $end = $input['period_end'] ?? '';
                $base = (float)($input['base_amount'] ?? 0);
                $bonus = (float)($input['bonus'] ?? 0);
                $ded = (float)($input['deduction'] ?? 0);

                // Adjust base amount based on teacher salary type
                if ($tid > 0 && ($start || $end)) {
                    try {
                        $tstmt = db()->prepare("SELECT salary_type, salary_amount FROM teachers WHERE id = ?");
                        $tstmt->execute([$tid]);
                        $t = $tstmt->fetch();
                        if ($t) {
                            $salaryType = $t['salary_type'] ?? 'fixed';
                            $salaryAmount = (float)($t['salary_amount'] ?? 0);
                            // Derive month start from period_start (or period_end as fallback)
                            $monthRef = $start ?: $end;
                            $monthStart = $monthRef ? date('Y-m-01', strtotime($monthRef)) : null;
                            if ($salaryType === 'fixed') {
                                // Fixed: base is the fixed salary amount
                                $base = $salaryAmount;
                            } elseif ($salaryType === 'per_student' && $monthStart) {
                                // Per-student (percentage of collected payments for this teacher's groups in the month)
                                $paidStmt = db()->prepare("
                                    SELECT COALESCE(SUM(pm.amount), 0) AS paid
                                    FROM payment_months pm
                                    JOIN payments p ON pm.payment_id = p.id
                                    JOIN groups g ON p.group_id = g.id
                                    WHERE g.teacher_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL
                                ");
                                $paidStmt->execute([$tid, $monthStart]);
                                $collected = (float)$paidStmt->fetchColumn();
                                if ($collected > 0 && $salaryAmount > 0) {
                                    $base = $collected * ($salaryAmount / 100);
                                } else {
                                    $base = 0;
                                }
                            }
                        }
                    } catch (Exception $e) {
                        // If anything goes wrong, fall back to provided base amount
                    }
                }

                $total = $base + $bonus - $ded;
                $stmt = db()->prepare("INSERT INTO salary_slips (teacher_id, period_start, period_end, base_amount, bonus, deduction, total, status) VALUES (?,?,?,?,?,?,?,?)");
                $stmt->execute([$tid, $start, $end, $base, $bonus, $ded, $total, $input['status'] ?? 'pending']);
                $sid = db()->lastInsertId();
                $newPayload = [
                    'teacher_id' => $tid,
                    'period_start' => $start,
                    'period_end' => $end,
                    'base_amount' => $base,
                    'bonus' => $bonus,
                    'deduction' => $ded,
                    'total' => $total,
                    'status' => $input['status'] ?? 'pending'
                ];
                $newPayload['id'] = (int)$sid;
                auditLog('create', 'salary_slip', (int)$sid, null, $newPayload);
                jsonResponse(['id' => (int)$sid]);
            } elseif ($id && $method === 'PUT') {
                $old = db()->prepare("SELECT id, status, paid_at FROM salary_slips WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Salary slip not found', 404); break; }
                $oldValues = ['status' => $oldRow['status'], 'paid_at' => $oldRow['paid_at']];
                $newStatus = $input['status'] ?? $oldRow['status'];
                $newPaidAt = isset($input['paid_at']) ? $input['paid_at'] : $oldRow['paid_at'];
                db()->prepare("UPDATE salary_slips SET status=?, paid_at=? WHERE id=?")
                    ->execute([$newStatus, $newPaidAt, $id]);
                $newValues = ['status' => $newStatus, 'paid_at' => $newPaidAt];
                auditLog('update', 'salary_slip', (int)$id, $oldValues, $newValues);
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                requireRole(['admin']);
                $old = db()->prepare("SELECT id FROM salary_slips WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                if (!$old->fetch()) { jsonError('Salary slip not found', 404); break; }
                db()->prepare("UPDATE salary_slips SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                auditLog('soft_delete', 'salary_slip', (int)$id, ['deleted_at' => null], ['deleted_at' => date('Y-m-d H:i:s')]);
                activityLog('soft_delete', 'salary_slip', $id);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'dashboard':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($sub === 'stats') {
                try {
                    // Current counts
                    $students = db()->query("SELECT COUNT(*) FROM students WHERE status='active' AND deleted_at IS NULL")->fetchColumn();
                    $teachers = db()->query("SELECT COUNT(*) FROM teachers WHERE status='active'")->fetchColumn();
                    $groups = db()->query("SELECT COUNT(*) FROM groups WHERE status='active' AND deleted_at IS NULL")->fetchColumn();
                    $revenue = db()->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE deleted_at IS NULL AND payment_date >= date_trunc('month', CURRENT_DATE)")->fetchColumn();
                    $expenses = db()->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE deleted_at IS NULL AND expense_date >= date_trunc('month', CURRENT_DATE)")->fetchColumn();
                    $leads = 0;
                    try {
                        $leads = db()->query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND status IN ('new','contacted','trial','interested','trial_scheduled','trial_completed','negotiating')")->fetchColumn();
                    } catch (PDOException $e) {}

                    // Calculate trends (compare vs last month)
                    // Students: count created this month vs last month
                    $studentsThisMonth = db()->query("SELECT COUNT(*) FROM students WHERE deleted_at IS NULL AND created_at >= date_trunc('month', CURRENT_DATE)")->fetchColumn();
                    $studentsLastMonth = db()->query("SELECT COUNT(*) FROM students WHERE deleted_at IS NULL AND created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)")->fetchColumn();
                    $studentsTrend = $studentsLastMonth > 0 ? round(($studentsThisMonth - $studentsLastMonth) / $studentsLastMonth * 100) : ($studentsThisMonth > 0 ? 100 : 0);
                    
                    // Revenue: this month vs last month
                    $revenueLastMonth = db()->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE deleted_at IS NULL AND payment_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND payment_date < date_trunc('month', CURRENT_DATE)")->fetchColumn();
                    $revenueTrend = $revenueLastMonth > 0 ? round(($revenue - $revenueLastMonth) / $revenueLastMonth * 100) : ($revenue > 0 ? 100 : 0);

                    // Expenses: this month vs last month
                    $expensesLastMonth = db()->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE deleted_at IS NULL AND expense_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND expense_date < date_trunc('month', CURRENT_DATE)")->fetchColumn();
                    $expensesTrend = $expensesLastMonth > 0 ? round(($expenses - $expensesLastMonth) / $expensesLastMonth * 100) : ($expenses > 0 ? 100 : 0);
                    
                    // Profit: this month vs last month
                    $profitThisMonth = (float)$revenue - (float)$expenses;
                    $profitLastMonth = (float)$revenueLastMonth - (float)$expensesLastMonth;
                    if ($profitLastMonth != 0) {
                        $profitTrend = round(($profitThisMonth - $profitLastMonth) / abs($profitLastMonth) * 100);
                    } else {
                        $profitTrend = $profitThisMonth > 0 ? 100 : ($profitThisMonth < 0 ? -100 : 0);
                    }
                    
                    jsonResponse([
                        'students' => (int)$students,
                        'teachers' => (int)$teachers,
                        'groups' => (int)$groups,
                        'revenue' => (float)$revenue,
                        'expenses' => (float)$expenses,
                        'profit' => $profitThisMonth,
                        'leads_pending' => (int)$leads,
                        'trends' => [
                            'students' => (int)$studentsTrend,
                            'revenue' => (int)$revenueTrend,
                            'expenses' => (int)$expensesTrend,
                            'profit' => (int)$profitTrend
                        ]
                    ]);
                } catch (PDOException $e) {
                    jsonResponse(['students' => 0, 'teachers' => 0, 'groups' => 0, 'revenue' => 0, 'expenses' => 0, 'profit' => 0, 'leads_pending' => 0, 'trends' => ['students' => 0, 'revenue' => 0, 'expenses' => 0, 'profit' => 0]]);
                }
            } elseif ($sub === 'revenue-chart') {
                // Get monthly revenue and expenses for the last 6 months
                try {
                    $months = [];
                    for ($i = 5; $i >= 0; $i--) {
                        $monthStart = date('Y-m-01', strtotime("-$i months"));
                        $monthEnd = date('Y-m-t', strtotime("-$i months"));
                        $monthLabel = date('M', strtotime($monthStart));
                        $monthYear = date('Y-m', strtotime($monthStart));

                        // Get revenue for this month
                        $revStmt = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_date BETWEEN ? AND ? AND deleted_at IS NULL");
                        $revStmt->execute([$monthStart, $monthEnd]);
                        $revenue = (float)$revStmt->fetchColumn();

                        // Get expenses for this month
                        $expStmt = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date BETWEEN ? AND ? AND deleted_at IS NULL");
                        $expStmt->execute([$monthStart, $monthEnd]);
                        $expenses = (float)$expStmt->fetchColumn();

                        $months[] = [
                            'month' => $monthLabel,
                            'month_year' => $monthYear,
                            'revenue' => round($revenue, 2),
                            'expenses' => round($expenses, 2),
                            'profit' => round($revenue - $expenses, 2)
                        ];
                    }

                    // Calculate growth percentage (current month vs previous month)
                    $currentRevenue = $months[5]['revenue'] ?? 0;
                    $previousRevenue = $months[4]['revenue'] ?? 0;
                    if ($previousRevenue > 0) {
                        $growth = round((($currentRevenue - $previousRevenue) / $previousRevenue) * 100, 1);
                    } else {
                        $growth = $currentRevenue > 0 ? 100 : 0;
                    }

                    jsonResponse([
                        'months' => $months,
                        'growth_percentage' => $growth
                    ]);
                } catch (PDOException $e) {
                    jsonResponse(['months' => [], 'growth_percentage' => 0]);
                }
            } else { jsonError('Not found', 404); }
            break;

        case 'reports':
            requireRole(['admin', 'manager', 'accountant']);
            $report = $sub ?: ($_GET['type'] ?? '');
            $from = $_GET['from'] ?? date('Y-m-01');
            $to = $_GET['to'] ?? date('Y-m-d');
            if ($report === 'payments') {
                $stmt = db()->prepare("SELECT p.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name FROM payments p JOIN students s ON p.student_id = s.id LEFT JOIN groups g ON p.group_id = g.id WHERE p.payment_date BETWEEN ? AND ? AND p.deleted_at IS NULL ORDER BY p.payment_date");
                $stmt->execute([$from, $to]);
                jsonResponse($stmt->fetchAll());
            } elseif ($report === 'expenses') {
                $stmt = db()->prepare("SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY expense_date");
                $stmt->execute([$from, $to]);
                jsonResponse($stmt->fetchAll());
            } elseif ($report === 'income-expense') {
                $inc = db()->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date BETWEEN ? AND ? AND deleted_at IS NULL");
                $inc->execute([$from, $to]);
                $exp = db()->prepare("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date BETWEEN ? AND ? AND deleted_at IS NULL");
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
            } elseif ($report === 'monthly') {
                // Monthly report: groups, teachers, students, payments, debt, revenue split
                $month = $_GET['month'] ?? date('Y-m'); // format: YYYY-MM
                $monthStart = $month . '-01';
                $monthEnd = date('Y-m-t', strtotime($monthStart));

                // Get all active groups with teacher info
                $groupsStmt = db()->query("
                    SELECT g.id, g.name, g.price, g.teacher_id,
                           TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')) AS teacher_name,
                           t.salary_type, t.salary_amount
                    FROM groups g
                    LEFT JOIN teachers t ON g.teacher_id = t.id
                    WHERE g.status = 'active' AND g.deleted_at IS NULL
                    ORDER BY g.name
                ");
                $groups = $groupsStmt->fetchAll();

                $reportGroups = [];
                $totals = [
                    'student_count' => 0,
                    'paid_student_count' => 0,
                    'expected_amount' => 0,
                    'collected_amount' => 0,
                    'remaining_debt' => 0,
                    'teacher_portion' => 0,
                    'center_portion' => 0
                ];

                foreach ($groups as $g) {
                    $groupId = (int)$g['id'];
                    $groupPrice = (float)$g['price'];

                    // Get enrolled students with their discounts
                    $enrollStmt = db()->prepare("
                        SELECT e.student_id, e.discount_percentage, e.enrolled_at
                        FROM enrollments e
                        JOIN students s ON e.student_id = s.id
                        WHERE e.group_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
                    ");
                    $enrollStmt->execute([$groupId]);
                    $enrollments = $enrollStmt->fetchAll();
                    $studentCount = count($enrollments);

                    // Calculate expected amount (sum of all student debts after discount)
                    $expectedAmount = 0;
                    $studentIds = [];
                    foreach ($enrollments as $e) {
                        $discount = (float)$e['discount_percentage'];
                        $monthlyDebt = $groupPrice * (1 - $discount / 100);
                        $expectedAmount += $monthlyDebt;
                        $studentIds[] = (int)$e['student_id'];
                    }

                    // Get collected amount for this group and month
                    $collectedAmount = 0;
                    $paidStudentIds = [];
                    if ($studentIds) {
                        $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
                        $collectedStmt = db()->prepare("
                            SELECT p.student_id, SUM(pm.amount) AS paid
                            FROM payment_months pm
                            JOIN payments p ON pm.payment_id = p.id
                            WHERE p.group_id = ? AND pm.for_month = ? AND p.student_id IN ($placeholders) AND p.deleted_at IS NULL
                            GROUP BY p.student_id
                        ");
                        $params = array_merge([$groupId, $monthStart], $studentIds);
                        $collectedStmt->execute($params);
                        foreach ($collectedStmt->fetchAll() as $row) {
                            $collectedAmount += (float)$row['paid'];
                            if ((float)$row['paid'] > 0) {
                                $paidStudentIds[] = (int)$row['student_id'];
                            }
                        }
                    }
                    $paidStudentCount = count(array_unique($paidStudentIds));
                    $remainingDebt = max(0, $expectedAmount - $collectedAmount);

                    // Calculate payment percentage
                    $paymentPercentage = $expectedAmount > 0 ? round(($collectedAmount / $expectedAmount) * 100, 1) : 0;

                    // Calculate teacher portion based on salary type
                    $teacherPortion = 0;
                    $salaryType = $g['salary_type'] ?? 'fixed';
                    $salaryAmount = (float)($g['salary_amount'] ?? 0);
                    if ($salaryType === 'per_student' && $collectedAmount > 0) {
                        // For per_student: salary_amount is percentage of collected
                        $teacherPortion = $collectedAmount * ($salaryAmount / 100);
                    }
                    $centerPortion = $collectedAmount - $teacherPortion;

                    $reportGroups[] = [
                        'group_id' => $groupId,
                        'group_name' => $g['name'],
                        'teacher_name' => $g['teacher_name'] ?? 'Unassigned',
                        'teacher_salary_type' => $salaryType,
                        'teacher_salary_amount' => $salaryAmount,
                        'student_count' => $studentCount,
                        'paid_student_count' => $paidStudentCount,
                        'expected_amount' => round($expectedAmount, 2),
                        'collected_amount' => round($collectedAmount, 2),
                        'remaining_debt' => round($remainingDebt, 2),
                        'payment_percentage' => $paymentPercentage,
                        'teacher_portion' => round($teacherPortion, 2),
                        'center_portion' => round($centerPortion, 2)
                    ];

                    // Accumulate totals
                    $totals['student_count'] += $studentCount;
                    $totals['paid_student_count'] += $paidStudentCount;
                    $totals['expected_amount'] += $expectedAmount;
                    $totals['collected_amount'] += $collectedAmount;
                    $totals['remaining_debt'] += $remainingDebt;
                    $totals['teacher_portion'] += $teacherPortion;
                    $totals['center_portion'] += $centerPortion;
                }

                // Round totals
                $totals['expected_amount'] = round($totals['expected_amount'], 2);
                $totals['collected_amount'] = round($totals['collected_amount'], 2);
                $totals['remaining_debt'] = round($totals['remaining_debt'], 2);
                $totals['teacher_portion'] = round($totals['teacher_portion'], 2);
                $totals['center_portion'] = round($totals['center_portion'], 2);
                $totals['payment_percentage'] = $totals['expected_amount'] > 0
                    ? round(($totals['collected_amount'] / $totals['expected_amount']) * 100, 1)
                    : 0;

                jsonResponse([
                    'month' => $month,
                    'groups' => $reportGroups,
                    'totals' => $totals
                ]);
            } else { jsonError('Report type required'); }
            break;

        case 'users':
            if ($method === 'GET') {
                requireRole(['admin', 'manager', 'accountant']);
                try {
                    $stmt = db()->query("SELECT u.id, u.username, u.name, u.role, u.teacher_id, u.email, u.phone, u.is_active, u.last_login, u.created_at, TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')) AS teacher_name FROM users u LEFT JOIN teachers t ON u.teacher_id = t.id ORDER BY u.created_at DESC");
                } catch (PDOException $e) {
                    $stmt = db()->query("SELECT id, username, name, role, email, phone, is_active, last_login, created_at FROM users ORDER BY created_at DESC");
                }
                $rows = $stmt->fetchAll();
                foreach ($rows as &$r) {
                    if (!isset($r['teacher_id'])) $r['teacher_id'] = null;
                    if (!isset($r['teacher_name'])) $r['teacher_name'] = null;
                }
                jsonResponse($rows);
            } elseif ($method === 'POST') {
                requireRole(['admin']);
                $role = $input['role'] ?? 'user';
                if (is_array($role)) $role = implode(',', array_map('trim', $role));
                $role = trim((string)$role) ?: 'user';
                $name = trim($input['name'] ?? '');
                $teacherId = isset($input['teacher_id']) ? (int)$input['teacher_id'] : null;
                $password = password_hash($input['password'] ?? 'password', PASSWORD_DEFAULT);
                try {
                    $stmt = db()->prepare("INSERT INTO users (username, password, name, role, teacher_id, email, phone, is_active) VALUES (?,?,?,?,?,?,?,?)");
                    $stmt->execute([
                        $input['username'] ?? '', $password, $name,
                        $role, $teacherId, $input['email'] ?? '', $input['phone'] ?? '', true
                    ]);
                } catch (PDOException $e) {
                    $stmt = db()->prepare("INSERT INTO users (username, password, name, role, email, phone, is_active) VALUES (?,?,?,?,?,?,?)");
                    $stmt->execute([
                        $input['username'] ?? '', $password, $name,
                        $role, $input['email'] ?? '', $input['phone'] ?? '', true
                    ]);
                }
                $newUserId = (int)db()->lastInsertId();
                auditLog('create', 'user', $newUserId, null, [
                    'username' => $input['username'] ?? '', 'name' => $name, 'role' => $role
                ]);
                jsonResponse(['id' => $newUserId]);
            } elseif ($id && $method === 'PUT') {
                requireRole(['admin']);
                $role = $input['role'] ?? null;
                if ($role !== null && is_array($role)) $role = implode(',', array_map('trim', $role));
                if ($role !== null) $role = trim((string)$role) ?: null;
                $teacherId = isset($input['teacher_id']) ? (int)$input['teacher_id'] : null;
                $name = isset($input['name']) ? trim($input['name']) : null;
                $fields = ['name', 'role', 'email', 'phone', 'is_active'];
                $sets = [];
                $params = [];
                if ($name !== null) { $sets[] = "name = ?"; $params[] = $name; }
                foreach ($fields as $f) {
                    if ($f === 'name' && $name !== null) continue;
                    if (isset($input[$f])) {
                        $sets[] = "$f = ?";
                        if ($f === 'is_active') {
                            $params[] = ($input[$f] === true || $input[$f] === 'true' || $input[$f] === 1 || $input[$f] === '1') ? 'true' : 'false';
                        } else {
                            $params[] = $input[$f];
                        }
                    }
                }
                if (array_key_exists('teacher_id', $input)) {
                    $sets[] = "teacher_id = ?";
                    $params[] = $input['teacher_id'] ? (int)$input['teacher_id'] : null;
                }
                if (!empty($input['password'])) {
                    $sets[] = "password = ?";
                    $params[] = password_hash($input['password'], PASSWORD_DEFAULT);
                }
                if ($sets) {
                    $oldStmt = db()->prepare("SELECT username, name, role, email, phone, is_active FROM users WHERE id = ?");
                    $oldStmt->execute([$id]);
                    $oldRow = $oldStmt->fetch();
                    $params[] = $id;
                    $stmt = db()->prepare("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?");
                    $stmt->execute($params);
                    $newStmt = db()->prepare("SELECT username, name, role, email, phone, is_active FROM users WHERE id = ?");
                    $newStmt->execute([$id]);
                    $newRow = $newStmt->fetch();
                    auditLog('update', 'user', $id, $oldRow ?: null, $newRow ?: null);
                }
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                requireRole(['admin']);
                $oldStmt = db()->prepare("SELECT username, name, role FROM users WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                db()->prepare("DELETE FROM users WHERE id = ? AND id != ?")->execute([$id, $GLOBALS['jwt_user']['id']]);
                auditLog('delete', 'user', $id, $oldRow ?: null, null);
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
                $schedGroupId = (int)($input['group_id'] ?? 0);
                $stmt = db()->prepare("INSERT INTO group_schedules (group_id, day_of_week, start_time, end_time, classroom) VALUES (?,?,?,?,?)");
                $stmt->execute([
                    $schedGroupId, (int)($input['day_of_week'] ?? 0),
                    $input['start_time'] ?? '09:00', $input['end_time'] ?? '10:00', $input['classroom'] ?? ''
                ]);
                $newSchedId = (int)db()->lastInsertId();

                // Notify teacher about schedule change
                $schedTeacher = getTeacherUserId($schedGroupId);
                if ($schedTeacher) {
                    $gNameStmt = db()->prepare("SELECT name FROM groups WHERE id = ?");
                    $gNameStmt->execute([$schedGroupId]);
                    $gName = $gNameStmt->fetchColumn();
                    createNotification($schedTeacher, 'schedule_change', "Schedule updated for {$gName}", "A new schedule entry was added", "/schedules");
                }

                jsonResponse(['id' => $newSchedId]);
            } elseif ($id && $method === 'PUT') {
                // Get group_id before update for notification
                $schedInfoStmt = db()->prepare("SELECT group_id FROM group_schedules WHERE id = ?");
                $schedInfoStmt->execute([$id]);
                $schedGroupId = (int)$schedInfoStmt->fetchColumn();

                $stmt = db()->prepare("UPDATE group_schedules SET day_of_week=?, start_time=?, end_time=?, classroom=? WHERE id=?");
                $stmt->execute([
                    (int)($input['day_of_week'] ?? 0), $input['start_time'] ?? '09:00',
                    $input['end_time'] ?? '10:00', $input['classroom'] ?? '', $id
                ]);

                // Notify teacher about schedule change
                if ($schedGroupId) {
                    $schedTeacher = getTeacherUserId($schedGroupId);
                    if ($schedTeacher) {
                        $gNameStmt = db()->prepare("SELECT name FROM groups WHERE id = ?");
                        $gNameStmt->execute([$schedGroupId]);
                        $gName = $gNameStmt->fetchColumn();
                        createNotification($schedTeacher, 'schedule_change', "Schedule updated for {$gName}", "Schedule entry was modified", "/schedules");
                    }
                }

                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                // Get group_id before delete for notification
                $schedInfoStmt = db()->prepare("SELECT group_id FROM group_schedules WHERE id = ?");
                $schedInfoStmt->execute([$id]);
                $schedGroupId = (int)$schedInfoStmt->fetchColumn();

                db()->prepare("DELETE FROM group_schedules WHERE id = ?")->execute([$id]);

                // Notify teacher about schedule change
                if ($schedGroupId) {
                    $schedTeacher = getTeacherUserId($schedGroupId);
                    if ($schedTeacher) {
                        $gNameStmt = db()->prepare("SELECT name FROM groups WHERE id = ?");
                        $gNameStmt->execute([$schedGroupId]);
                        $gName = $gNameStmt->fetchColumn();
                        createNotification($schedTeacher, 'schedule_change', "Schedule updated for {$gName}", "A schedule entry was removed", "/schedules");
                    }
                }

                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'settings':
            if ($method === 'GET') {
                requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
                try {
                    $stmt = db()->query("SELECT key, value, description FROM settings ORDER BY key");
                    $settings = [];
                    foreach ($stmt->fetchAll() as $row) {
                        $settings[$row['key']] = $row['value'];
                    }
                    jsonResponse($settings);
                } catch (PDOException $e) {
                    jsonResponse([]);
                }
            } elseif ($method === 'PUT') {
                requireRole(['admin']);
                foreach ($input as $key => $value) {
                    // Insert if not exists, update if exists
                    $stmt = db()->prepare("SELECT 1 FROM settings WHERE key = ?");
                    $stmt->execute([$key]);
                    if ($stmt->fetch()) {
                        $stmt = db()->prepare("UPDATE settings SET value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?");
                        $stmt->execute([$value, $GLOBALS['jwt_user']['id'], $key]);
                    } else {
                        $stmt = db()->prepare("INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)");
                        $stmt->execute([$key, $value, $GLOBALS['jwt_user']['id']]);
                    }
                }
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'notifications':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            $userId = $GLOBALS['jwt_user']['id'];
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
                $stmt = db()->query("SELECT id, first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes, created_at FROM students WHERE deleted_at IS NULL ORDER BY last_name, first_name");
                jsonResponse($stmt->fetchAll());
            } else { jsonError('Not found', 404); }
            break;

        case 'audit-log':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method !== 'GET') { jsonError('Method not allowed', 405); break; }
            try {
                $entityType = $_GET['entity_type'] ?? null;
                $entityId = isset($_GET['entity_id']) ? (int)$_GET['entity_id'] : null;
                $action = $_GET['action'] ?? null;
                $dateFrom = $_GET['date_from'] ?? null;
                $dateTo = $_GET['date_to'] ?? null;
                $limit = min(500, max(1, (int)($_GET['limit'] ?? 50)));
                $offset = max(0, (int)($_GET['offset'] ?? 0));

                $whereClauses = ["1=1"];
                $params = [];
                if ($entityType) { $whereClauses[] = "a.entity_type = ?"; $params[] = $entityType; }
                if ($entityId) { $whereClauses[] = "a.entity_id = ?"; $params[] = $entityId; }
                if ($action) { $whereClauses[] = "a.action = ?"; $params[] = $action; }
                if ($dateFrom) { $whereClauses[] = "a.created_at >= ?"; $params[] = $dateFrom . ' 00:00:00'; }
                if ($dateTo) { $whereClauses[] = "a.created_at <= ?"; $params[] = $dateTo . ' 23:59:59'; }
                $whereStr = implode(' AND ', $whereClauses);

                // Get total count
                $countStmt = db()->prepare("SELECT COUNT(*) FROM audit_log a WHERE $whereStr");
                $countStmt->execute($params);
                $total = (int)$countStmt->fetchColumn();

                $q = "SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.old_values, a.new_values, a.ip_address, a.created_at, u.name AS changed_by_name, u.username AS changed_by_username
                      FROM audit_log a
                      LEFT JOIN users u ON a.user_id = u.id
                      WHERE $whereStr
                      ORDER BY a.created_at DESC LIMIT $limit OFFSET $offset";
                $stmt = db()->prepare($q);
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$row) {
                    if (!empty($row['old_values']) && is_string($row['old_values'])) $row['old_values'] = json_decode($row['old_values'], true);
                    if (!empty($row['new_values']) && is_string($row['new_values'])) $row['new_values'] = json_decode($row['new_values'], true);
                }
                jsonResponse(['rows' => $rows, 'total' => $total]);
            } catch (PDOException $e) {
                jsonResponse(['rows' => [], 'total' => 0]);
            }
            break;

        case 'student-debt':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method !== 'GET') { jsonError('Method not allowed', 405); break; }
            $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
            $groupId = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
            $month = $_GET['month'] ?? date('Y-m'); // format: YYYY-MM
            if (!$studentId || !$groupId) {
                jsonError('student_id and group_id required');
                break;
            }
            // Get enrollment info with discount
            $enrollStmt = db()->prepare("
                SELECT e.discount_percentage, e.enrolled_at, g.price AS group_price
                FROM enrollments e
                JOIN groups g ON e.group_id = g.id
                WHERE e.student_id = ? AND e.group_id = ?
            ");
            $enrollStmt->execute([$studentId, $groupId]);
            $enrollment = $enrollStmt->fetch();
            if (!$enrollment) {
                jsonError('Student not enrolled in this group', 404);
                break;
            }
            $groupPrice = (float)$enrollment['group_price'];
            $discountPct = (float)$enrollment['discount_percentage'];
            $monthlyDebt = $groupPrice * (1 - $discountPct / 100);

            // Get paid amount for this month
            $monthStart = $month . '-01';
            $paidStmt = db()->prepare("
                SELECT COALESCE(SUM(pm.amount), 0) AS paid
                FROM payment_months pm
                JOIN payments p ON pm.payment_id = p.id
                WHERE p.student_id = ? AND p.group_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL
            ");
            $paidStmt->execute([$studentId, $groupId, $monthStart]);
            $paidAmount = (float)$paidStmt->fetchColumn();
            $remainingDebt = max(0, $monthlyDebt - $paidAmount);

            jsonResponse([
                'student_id' => $studentId,
                'group_id' => $groupId,
                'month' => $month,
                'group_price' => $groupPrice,
                'discount_percentage' => $discountPct,
                'monthly_debt' => round($monthlyDebt, 2),
                'paid_amount' => round($paidAmount, 2),
                'remaining_debt' => round($remainingDebt, 2)
            ]);
            break;

        case 'profile':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            $userId = $GLOBALS['jwt_user']['id'];
            if ($method === 'PUT' && $sub === 'password') {
                // Change password
                $currentPassword = $input['current_password'] ?? '';
                $newPassword = $input['new_password'] ?? '';
                if (!$currentPassword || !$newPassword) {
                    jsonError('Current and new password required');
                    break;
                }
                if (strlen($newPassword) < 6) {
                    jsonError('Password must be at least 6 characters');
                    break;
                }
                $stmt = db()->prepare("SELECT password FROM users WHERE id = ?");
                $stmt->execute([$userId]);
                $user = $stmt->fetch();
                if (!$user || !password_verify($currentPassword, $user['password'])) {
                    jsonError('Current password is incorrect', 401);
                    break;
                }
                $hash = password_hash($newPassword, PASSWORD_DEFAULT);
                $stmt = db()->prepare("UPDATE users SET password = ? WHERE id = ?");
                $stmt->execute([$hash, $userId]);
                activityLog('password_change', 'user', $userId);
                jsonResponse(['ok' => true]);
            } elseif ($method === 'PUT') {
                // Update profile
                $name = trim($input['name'] ?? '');
                $email = trim($input['email'] ?? '');
                $phone = trim($input['phone'] ?? '');
                if (!$name) {
                    jsonError('Name is required');
                    break;
                }
                $stmt = db()->prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?");
                $stmt->execute([$name, $email ?: null, $phone ?: null, $userId]);
                activityLog('profile_update', 'user', $userId);
                jsonResponse(['ok' => true]);
            } else { jsonError('Method not allowed', 405); }
            break;

        case 'student-attendance':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method === 'GET') {
                $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
                if (!$studentId) { jsonError('student_id required'); break; }
                $limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 200) : 60;
                $stmt = db()->prepare("
                    SELECT a.attendance_date, a.status, g.name AS group_name, g.id AS group_id
                    FROM attendance a
                    JOIN groups g ON a.group_id = g.id
                    WHERE a.student_id = ?
                    ORDER BY a.attendance_date DESC, g.name
                    LIMIT ?
                ");
                $stmt->execute([$studentId, $limit]);
                jsonResponse($stmt->fetchAll());
            } else { jsonError('Not found', 404); }
            break;

        case 'student-notes':
            requireRole(['admin', 'manager', 'teacher', 'accountant']);
            if ($method === 'GET') {
                $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
                if (!$studentId) { jsonError('student_id required'); break; }
                $stmt = db()->prepare("
                    SELECT sn.id, sn.student_id, sn.content, sn.created_by, sn.created_at,
                           u.name AS created_by_name
                    FROM student_notes sn
                    LEFT JOIN users u ON sn.created_by = u.id
                    WHERE sn.student_id = ?
                    ORDER BY sn.created_at DESC
                ");
                $stmt->execute([$studentId]);
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $studentId = (int)($input['student_id'] ?? 0);
                $content = trim($input['content'] ?? '');
                if (!$studentId || !$content) { jsonError('student_id and content required'); break; }
                $userId = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO student_notes (student_id, content, created_by) VALUES (?, ?, ?)");
                $stmt->execute([$studentId, $content, $userId]);
                $noteId = db()->lastInsertId();
                jsonResponse(['id' => (int)$noteId]);
            } elseif ($id && $method === 'DELETE') {
                $stmt = db()->prepare("DELETE FROM student_notes WHERE id = ?");
                $stmt->execute([$id]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'group-debtors':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method !== 'GET') { jsonError('Method not allowed', 405); break; }
            $groupId = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
            $month = $_GET['month'] ?? date('Y-m');
            if (!$groupId) { jsonError('group_id required'); break; }
            $monthStart = $month . '-01';

            $stmt = db()->prepare("
                SELECT
                    s.id,
                    s.first_name,
                    s.last_name,
                    s.phone,
                    g.price AS group_price,
                    e.discount_percentage,
                    g.price * (1 - COALESCE(e.discount_percentage, 0) / 100) AS expected,
                    COALESCE(
                        (SELECT SUM(pm.amount)
                         FROM payment_months pm
                         JOIN payments p ON pm.payment_id = p.id
                         WHERE p.student_id = s.id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL),
                        0
                    ) AS paid
                FROM enrollments e
                JOIN students s ON e.student_id = s.id
                JOIN groups g ON e.group_id = g.id
                WHERE e.group_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
                ORDER BY s.first_name, s.last_name
            ");
            $stmt->execute([$monthStart, $groupId]);
            $rows = $stmt->fetchAll();
            $result = [];
            foreach ($rows as $row) {
                $expected = round((float)$row['expected'], 2);
                $paid = round((float)$row['paid'], 2);
                $debt = round(max(0, $expected - $paid), 2);
                $result[] = [
                    'id' => (int)$row['id'],
                    'first_name' => $row['first_name'],
                    'last_name' => $row['last_name'],
                    'phone' => $row['phone'],
                    'expected' => $expected,
                    'paid' => $paid,
                    'debt' => $debt,
                ];
            }
            jsonResponse($result);
            break;

        case 'collections':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $currentMonth = date('Y-m-01');
                $stmt = db()->prepare("
                    SELECT
                        s.id,
                        s.first_name,
                        s.last_name,
                        s.phone,
                        s.parent_phone,
                        COALESCE(
                            (SELECT json_agg(json_build_object('group_id', g.id, 'group_name', g.name, 'price', g.price, 'discount', e.discount_percentage))
                             FROM enrollments e
                             JOIN groups g ON e.group_id = g.id
                             WHERE e.student_id = s.id),
                            '[]'
                        ) AS enrollments_json,
                        debt.expected,
                        debt.paid,
                        debt.expected - debt.paid AS debt,
                        cc_agg.last_call_date,
                        cc_agg.last_call_notes,
                        cc_agg.call_count
                    FROM students s
                    INNER JOIN (
                        SELECT
                            e.student_id,
                            SUM(g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)) AS expected,
                            COALESCE(SUM(
                                (SELECT COALESCE(SUM(pm.amount), 0)
                                 FROM payment_months pm
                                 JOIN payments p ON pm.payment_id = p.id
                                 WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL)
                            ), 0) AS paid
                        FROM enrollments e
                        JOIN groups g ON e.group_id = g.id
                        GROUP BY e.student_id
                        HAVING SUM(g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)) -
                               COALESCE(SUM(
                                   (SELECT COALESCE(SUM(pm.amount), 0)
                                    FROM payment_months pm
                                    JOIN payments p ON pm.payment_id = p.id
                                    WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL)
                               ), 0) > 0
                    ) debt ON debt.student_id = s.id
                    LEFT JOIN (
                        SELECT
                            cc.student_id,
                            MAX(cc.created_at) AS last_call_date,
                            (SELECT cc2.notes FROM collection_calls cc2 WHERE cc2.student_id = cc.student_id ORDER BY cc2.created_at DESC LIMIT 1) AS last_call_notes,
                            COUNT(*) AS call_count
                        FROM collection_calls cc
                        GROUP BY cc.student_id
                    ) cc_agg ON cc_agg.student_id = s.id
                    WHERE s.deleted_at IS NULL AND s.status = 'active'
                    ORDER BY debt.expected - debt.paid DESC
                ");
                $stmt->execute([$currentMonth, $currentMonth]);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$row) {
                    $row['enrollments'] = json_decode($row['enrollments_json'], true) ?: [];
                    unset($row['enrollments_json']);
                    $row['expected'] = round((float)$row['expected'], 2);
                    $row['paid'] = round((float)$row['paid'], 2);
                    $row['debt'] = round((float)$row['debt'], 2);
                    $row['call_count'] = (int)($row['call_count'] ?? 0);
                }
                jsonResponse($rows);
            } else { jsonError('Not found', 404); }
            break;

        case 'collection-calls':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
                if (!$studentId) { jsonError('student_id required'); break; }
                $stmt = db()->prepare("
                    SELECT cc.id, cc.student_id, cc.notes, cc.created_by, cc.created_at,
                           u.name AS created_by_name
                    FROM collection_calls cc
                    LEFT JOIN users u ON cc.created_by = u.id
                    WHERE cc.student_id = ?
                    ORDER BY cc.created_at DESC
                ");
                $stmt->execute([$studentId]);
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $studentId = (int)($input['student_id'] ?? 0);
                $notes = trim($input['notes'] ?? '');
                if (!$studentId || !$notes) { jsonError('student_id and notes required'); break; }
                $userId = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO collection_calls (student_id, notes, created_by) VALUES (?, ?, ?)");
                $stmt->execute([$studentId, $notes, $userId]);
                $callId = db()->lastInsertId();
                jsonResponse(['id' => (int)$callId]);
            } else { jsonError('Not found', 404); }
            break;

        case 'birthdays':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            if ($method === 'GET') {
                // Get today's birthdays (match month and day from dob)
                $stmt = db()->query("
                    SELECT id, first_name, last_name, dob, phone, status
                    FROM students
                    WHERE deleted_at IS NULL
                      AND dob IS NOT NULL
                      AND EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM CURRENT_DATE)
                      AND EXTRACT(DAY FROM dob) = EXTRACT(DAY FROM CURRENT_DATE)
                    ORDER BY first_name, last_name
                ");
                jsonResponse($stmt->fetchAll());
            } else { jsonError('Not found', 404); }
            break;

        case 'cron-notifications':
            requireRole(['admin']);
            if ($method !== 'POST') { jsonError('Method not allowed', 405); break; }

            $created = 0;

            // Get admin/manager user IDs for bulk notifications
            $admMgrStmt = db()->query("SELECT id FROM users WHERE is_active = true AND (role LIKE '%admin%' OR role LIKE '%manager%')");
            $adminManagerIds = array_column($admMgrStmt->fetchAll(), 'id');

            // 3a. Payment reminders
            if (isNotificationEnabled('payment_reminder')) {
            $reminderDayStmt = db()->prepare("SELECT value FROM settings WHERE key = 'payment_reminder_day'");
            $reminderDayStmt->execute();
            $reminderDay = (int)($reminderDayStmt->fetchColumn() ?: 10);
            $todayDay = (int)date('j');

            if ($todayDay >= $reminderDay) {
                $currentMonth = date('Y-m-01');
                // Find active students enrolled in groups who haven't fully paid for current month
                $unpaidStmt = db()->prepare("
                    SELECT * FROM (
                        SELECT s.id AS student_id,
                               s.first_name || ' ' || s.last_name AS student_name,
                               g.id AS group_id,
                               g.name AS group_name,
                               g.price * (1 - e.discount_percentage / 100.0) AS expected,
                               COALESCE((
                                   SELECT SUM(pm.amount)
                                   FROM payment_months pm
                                   JOIN payments p ON pm.payment_id = p.id
                                   WHERE p.student_id = s.id AND p.group_id = g.id
                                     AND pm.for_month = ? AND p.deleted_at IS NULL
                               ), 0) AS paid
                        FROM students s
                        JOIN enrollments e ON s.id = e.student_id
                        JOIN groups g ON e.group_id = g.id
                        WHERE s.status = 'active' AND s.deleted_at IS NULL
                          AND g.status = 'active'
                    ) sub
                    WHERE paid < expected
                ");
                $unpaidStmt->execute([$currentMonth]);
                $unpaidStudents = $unpaidStmt->fetchAll();

                foreach ($unpaidStudents as $us) {
                    $link = "/students/{$us['student_id']}";
                    foreach ($adminManagerIds as $admId) {
                        // Deduplicate: check if notification already exists today for this combo
                        $dupStmt = db()->prepare("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'payment_reminder' AND link = ? AND created_at::date = CURRENT_DATE");
                        $dupStmt->execute([$admId, $link]);
                        if (!$dupStmt->fetch()) {
                            createNotification((int)$admId, 'payment_reminder', "Payment due: {$us['student_name']}", "{$us['student_name']} hasn't paid for {$us['group_name']} this month", $link);
                            $created++;
                        }
                    }
                }
            }
            } // end if payment reminders enabled

            // 3b. Lead follow-up overdue
            if (isNotificationEnabled('lead_followup_overdue')) {
            $overdueStmt = db()->query("
                SELECT id, first_name, last_name, follow_up_date
                FROM leads
                WHERE follow_up_date <= CURRENT_DATE
                  AND status NOT IN ('enrolled', 'lost')
                  AND deleted_at IS NULL
            ");
            $overdueLeads = $overdueStmt->fetchAll();

            foreach ($overdueLeads as $lead) {
                $link = "/leads";
                $leadName = $lead['first_name'] . ' ' . $lead['last_name'];
                foreach ($adminManagerIds as $admId) {
                    // Deduplicate
                    $dupLink = "/leads";
                    $dupStmt = db()->prepare("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'lead_followup_overdue' AND message LIKE ? AND created_at::date = CURRENT_DATE");
                    $dupStmt->execute([$admId, "%{$leadName}%"]);
                    if (!$dupStmt->fetch()) {
                        createNotification((int)$admId, 'lead_followup_overdue', "Follow-up overdue: {$leadName}", "Follow-up was due on {$lead['follow_up_date']}", $dupLink);
                        $created++;
                    }
                }
            }
            } // end if lead follow-up enabled

            jsonResponse(['ok' => true, 'notifications_created' => $created]);
            break;

        default:
            jsonError('Not found', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
