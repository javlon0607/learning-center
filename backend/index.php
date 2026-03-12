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
if (in_array($method, ['POST', 'PUT', 'PATCH']) && strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
} elseif ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
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
                    // Credit from payments made this month in groups student is no longer enrolled in
                    $tcStmt = db()->prepare("
                        SELECT COALESCE(SUM(pm.amount), 0)
                        FROM payment_months pm
                        JOIN payments p ON pm.payment_id = p.id
                        LEFT JOIN enrollments ecur ON ecur.student_id = p.student_id AND ecur.group_id = p.group_id
                        WHERE p.student_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL AND ecur.id IS NULL
                    ");
                    $tcStmt->execute([$id, $currentMonth]);
                    $transferCredit = (float)$tcStmt->fetchColumn();
                    $student['current_month_debt'] = round(max(0, $expected - $paid - $transferCredit), 2);
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

                // Calculate debt for all students in a single batch query (avoids N+1)
                $currentMonth = date('Y-m-01');
                foreach ($students as &$student) {
                    $student['enrollments'] = json_decode($student['enrollments_json'], true) ?: [];
                    unset($student['enrollments_json']);
                    $student['current_month_debt'] = 0;
                    $student['current_month_expected'] = 0;
                    $student['current_month_paid'] = 0;
                }
                unset($student);
                $studentIds = array_column($students, 'id');
                if (!empty($studentIds)) {
                    $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
                    $batchDebt = db()->prepare("
                        SELECT
                            e.student_id,
                            SUM(g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)) AS expected,
                            COALESCE(SUM(COALESCE(pm_g.paid, 0)), 0)
                                + COALESCE(MAX(COALESCE(tc.transfer_credit, 0)), 0) AS paid
                        FROM enrollments e
                        JOIN groups g ON e.group_id = g.id
                        LEFT JOIN (
                            SELECT p.student_id, p.group_id, SUM(pm.amount) AS paid
                            FROM payments p
                            JOIN payment_months pm ON pm.payment_id = p.id
                            WHERE pm.for_month = ? AND p.deleted_at IS NULL
                            GROUP BY p.student_id, p.group_id
                        ) pm_g ON pm_g.student_id = e.student_id AND pm_g.group_id = e.group_id
                        LEFT JOIN (
                            SELECT p.student_id, SUM(pm.amount) AS transfer_credit
                            FROM payments p
                            JOIN payment_months pm ON pm.payment_id = p.id
                            LEFT JOIN enrollments ecur ON ecur.student_id = p.student_id AND ecur.group_id = p.group_id
                            WHERE pm.for_month = ? AND p.deleted_at IS NULL AND ecur.id IS NULL
                            GROUP BY p.student_id
                        ) tc ON tc.student_id = e.student_id
                        WHERE e.student_id IN ($placeholders)
                        GROUP BY e.student_id
                    ");
                    $batchDebt->execute([$currentMonth, $currentMonth, ...$studentIds]);
                    $debtMap = [];
                    foreach ($batchDebt->fetchAll() as $row) {
                        $debtMap[(int)$row['student_id']] = $row;
                    }
                    foreach ($students as &$student) {
                        $debtRow = $debtMap[$student['id']] ?? null;
                        if ($debtRow) {
                            $expected = (float)$debtRow['expected'];
                            $paid = (float)$debtRow['paid'];
                            $student['current_month_debt'] = round(max(0, $expected - $paid), 2);
                            $student['current_month_expected'] = round($expected, 2);
                            $student['current_month_paid'] = round($paid, 2);
                        }
                    }
                    unset($student);
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
                if (!empty($input['phone']) && isPhoneTaken($input['phone'])) { jsonError('This phone number is already in use'); break; }
                if (!empty($input['phone2']) && isPhoneTaken($input['phone2'])) { jsonError('Phone 2 is already in use'); break; }
                $stmt = db()->prepare("INSERT INTO students (first_name, last_name, dob, phone, phone2, email, parent_name, parent_phone, status, notes, source, referred_by_type, referred_by_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
                $stmt->execute([
                    $input['first_name'] ?? '', $input['last_name'] ?? '', $input['dob'] ?? null,
                    $input['phone'] ?? '', $input['phone2'] ?? null, $input['email'] ?? '',
                    $input['parent_name'] ?? '', $input['parent_phone'] ?? '', $input['status'] ?? 'active', $input['notes'] ?? '',
                    $source, $referredByType, $referredById, $createdBy
                ]);
                $id = db()->lastInsertId();
                // If notes provided, also create a student_note so it appears in the Notes tab
                $notes = trim($input['notes'] ?? '');
                if ($notes !== '') {
                    db()->prepare("INSERT INTO student_notes (student_id, content, created_by) VALUES (?, ?, ?)")
                        ->execute([(int)$id, $notes, $createdBy]);
                }
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
                $oldStmt = db()->prepare("SELECT first_name, last_name, dob, phone, phone2, email, parent_name, parent_phone, status, notes, source FROM students WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                $newPhone  = $input['phone']  ?? $oldRow['phone'];
                $newPhone2 = array_key_exists('phone2', $input) ? $input['phone2'] : $oldRow['phone2'];
                if (!empty($newPhone)  && $newPhone  !== $oldRow['phone']  && isPhoneTaken($newPhone,  'students', (int)$id, 'phone'))  { jsonError('This phone number is already in use'); break; }
                if (!empty($newPhone2) && $newPhone2 !== $oldRow['phone2'] && isPhoneTaken($newPhone2, 'students', (int)$id, 'phone2')) { jsonError('Phone 2 is already in use'); break; }
                $stmt = db()->prepare("UPDATE students SET first_name=?, last_name=?, dob=?, phone=?, phone2=?, email=?, parent_name=?, parent_phone=?, status=?, notes=?, source=? WHERE id=?");
                $newValues = [
                    'first_name' => $input['first_name'] ?? $oldRow['first_name'], 'last_name' => $input['last_name'] ?? $oldRow['last_name'],
                    'dob' => array_key_exists('dob', $input) ? $input['dob'] : $oldRow['dob'],
                    'phone' => $newPhone, 'phone2' => $newPhone2, 'email' => $input['email'] ?? $oldRow['email'],
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
                    $birthday = isset($input['birthday']) && $input['birthday'] ? $input['birthday'] : null;
                    $salaryType = $input['salary_type'] ?? 'fixed';
                    $salaryAmount = (float)($input['salary_amount'] ?? 0);
                    $status = $input['status'] ?? 'active';
                    $stmt = db()->prepare("INSERT INTO teachers (first_name, last_name, phone, email, subjects, birthday, salary_type, salary_amount, status) VALUES (?,?,?,?,?,?,?,?,?)");
                    $stmt->execute([$firstName, $lastName, '', '', $subjects, $birthday, $salaryType, $salaryAmount, $status]);
                    $teacherId = (int)db()->lastInsertId();
                    try {
                        db()->prepare("UPDATE users SET teacher_id = ? WHERE id = ?")->execute([$teacherId, $userId]);
                    } catch (PDOException $e) { /* ignore if column missing */ }
                    // Auto-create employee record for this teacher
                    try {
                        $empFullName = trim($firstName . ' ' . $lastName);
                        $empBaseSalary = ($salaryType === 'fixed') ? $salaryAmount : 0;
                        $empStatus = ($status === 'active') ? 'active' : 'inactive';
                        $empSubjects = strtolower((string)($subjects ?? ''));
                        if (strpos($empSubjects, 'ielts') !== false) $empPos = 'IELTS Instructor';
                        elseif (strpos($empSubjects, 'senior') !== false) $empPos = 'Senior Teacher';
                        else $empPos = 'English Teacher';
                        db()->prepare("INSERT INTO employees (full_name, department, position, base_salary, birthday, teacher_id, status) VALUES (?, 'academic', ?, ?, ?, ?, ?) ON CONFLICT (teacher_id) DO NOTHING")
                            ->execute([$empFullName, $empPos, $empBaseSalary, $birthday, $teacherId, $empStatus]);
                    } catch (PDOException $e) { /* ignore */ }
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
                $oldStmt = db()->prepare("SELECT first_name, last_name, phone, email, subjects, salary_type, salary_amount, status, birthday FROM teachers WHERE id = ?");
                $oldStmt->execute([$id]);
                $oldRow = $oldStmt->fetch();
                $newPhone = $input['phone'] ?? $oldRow['phone'];
                if (!empty($newPhone) && $newPhone !== $oldRow['phone'] && isPhoneTaken($newPhone, 'teachers', (int)$id, 'phone')) { jsonError('This phone number is already in use'); break; }
                $newValues = [
                    'first_name' => $input['first_name'] ?? $oldRow['first_name'], 'last_name' => $input['last_name'] ?? $oldRow['last_name'],
                    'phone' => $newPhone, 'email' => $input['email'] ?? $oldRow['email'],
                    'subjects' => $input['subjects'] ?? $oldRow['subjects'], 'salary_type' => $input['salary_type'] ?? $oldRow['salary_type'],
                    'salary_amount' => $input['salary_amount'] ?? $oldRow['salary_amount'], 'status' => $input['status'] ?? $oldRow['status'],
                    'birthday' => array_key_exists('birthday', $input) ? ($input['birthday'] ?: null) : $oldRow['birthday'],
                ];
                $stmt = db()->prepare("UPDATE teachers SET first_name=?, last_name=?, phone=?, email=?, subjects=?, salary_type=?, salary_amount=?, status=?, birthday=? WHERE id=?");
                $stmt->execute(array_merge(array_values($newValues), [$id]));
                // Sync employee record
                try {
                    $empFullName = trim($newValues['first_name'] . ' ' . $newValues['last_name']);
                    $empBaseSalary = ($newValues['salary_type'] === 'fixed') ? (float)$newValues['salary_amount'] : 0;
                    $empStatus = ($newValues['status'] === 'active') ? 'active' : 'inactive';
                    db()->prepare("UPDATE employees SET full_name=?, base_salary=?, status=?, birthday=? WHERE teacher_id=? AND deleted_at IS NULL")
                        ->execute([$empFullName, $empBaseSalary, $empStatus, $newValues['birthday'], $id]);
                } catch (PDOException $e) { /* ignore */ }
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

                // Telegram: notify if schedule changed
                $newScheduleDays = $input['schedule_days'] ?? $oldRow['schedule_days'];
                $newTimeStart = $input['schedule_time_start'] ?? $oldRow['schedule_time_start'];
                $newTimeEnd = $input['schedule_time_end'] ?? $oldRow['schedule_time_end'];
                $scheduleChanged = ($newScheduleDays !== $oldRow['schedule_days'])
                    || ($newTimeStart !== $oldRow['schedule_time_start'])
                    || ($newTimeEnd !== $oldRow['schedule_time_end']);
                if ($scheduleChanged) {
                    try {
                        $groupName = $newValues['name'];
                        $scheduleMsg = "Schedule changed for <b>{$groupName}</b>: {$newScheduleDays} {$newTimeStart}–{$newTimeEnd}";
                        // Notify enrolled students
                        $enrolledStmt = db()->prepare("SELECT e.student_id FROM enrollments e JOIN students s ON e.student_id = s.id WHERE e.group_id = ? AND s.status = 'active' AND s.deleted_at IS NULL");
                        $enrolledStmt->execute([$id]);
                        foreach ($enrolledStmt->fetchAll() as $eRow) {
                            telegramNotifyStudent((int)$eRow['student_id'], $scheduleMsg, 'schedule_change', $id);
                        }
                        // Notify teacher
                        $teacherId = $newValues['teacher_id'] ?? $oldRow['teacher_id'];
                        if ($teacherId) {
                            telegramNotifyTeacher((int)$teacherId, $scheduleMsg, 'schedule_change', $id);
                        }
                    } catch (Exception $e) { /* ignore telegram errors */ }
                }

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
                    $stmt = db()->prepare("SELECT e.*, s.first_name || ' ' || s.last_name AS student_name, s.phone AS student_phone, s.parent_phone FROM enrollments e JOIN students s ON e.student_id = s.id WHERE e.group_id = ?");
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
                               gt.from_enrolled_at::text AS from_enrolled_at,
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

                // Capture enrolled_at before deletion
                $enrolledAtStmt = db()->prepare("SELECT enrolled_at FROM enrollments WHERE student_id = ? AND group_id = ?");
                $enrolledAtStmt->execute([$studentId, $fromGroupId]);
                $fromEnrolledAt = $enrolledAtStmt->fetchColumn();

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
                        INSERT INTO group_transfers (student_id, from_group_id, to_group_id, reason, paid_month, discount_percentage, transferred_by, from_enrolled_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $histStmt->execute([$studentId, $fromGroupId, $toGroupId, $reason, $paidMonth, $discountPct, $userId, $fromEnrolledAt ?: null]);

                    // If student paid for current month, create a payment record for the new group
                    // to mark this month as paid (amount = 0, just a marker)
                    if ($paidMonth) {
                        // Insert a "transfer credit" payment (auto-approved so it counts in debt calculations)
                        $creditStmt = db()->prepare("
                            INSERT INTO payments (student_id, group_id, amount, payment_date, method, notes, is_approved)
                            VALUES (?, ?, 0, CURRENT_DATE, 'transfer', ?, TRUE)
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
                $where = ['p.deleted_at IS NULL'];
                $params = [];
                if (!empty($_GET['student_id'])) {
                    $where[] = "p.student_id = ?";
                    $params[] = (int)$_GET['student_id'];
                }
                $whereClause = 'WHERE ' . implode(' AND ', $where);
                $q = "
                    SELECT p.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name,
                           u_approver.name AS approved_by_name,
                           u_creator.name AS created_by_name
                    FROM payments p
                    JOIN students s ON p.student_id = s.id
                    LEFT JOIN groups g ON p.group_id = g.id
                    LEFT JOIN users u_approver ON p.approved_by = u_approver.id
                    LEFT JOIN users u_creator ON p.created_by = u_creator.id
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
            } elseif ($id && $method === 'POST' && ($segments[2] ?? '') === 'approve') {
                requireFeature('payment_approve');
                $payment = db()->prepare("SELECT id, is_approved FROM payments WHERE id = ? AND deleted_at IS NULL");
                $payment->execute([$id]);
                $row = $payment->fetch();
                if (!$row) { jsonError('Payment not found', 404); break; }
                if ($row['is_approved'] === true || $row['is_approved'] === 't') {
                    jsonError('Payment already approved', 400); break;
                }
                $userId = $GLOBALS['jwt_user']['id'];
                db()->prepare("UPDATE payments SET is_approved = TRUE, approved_by = ?, approved_at = NOW() WHERE id = ?")
                    ->execute([$userId, $id]);
                auditLog('approve', 'payment', (int)$id, ['is_approved' => false], ['is_approved' => true, 'approved_by' => $userId]);
                activityLog('approve', 'payment', $id);
                jsonResponse(['ok' => true]);
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

                $createdBy = $GLOBALS['jwt_user']['id'] ?? null;
                $newPayload = [
                    'student_id' => $studentId,
                    'group_id' => $groupId,
                    'amount' => $amount,
                    'payment_date' => $paymentDate,
                    'method' => $method_pay,
                    'notes' => $notes,
                    'created_by' => $createdBy
                ];
                $stmt = db()->prepare("INSERT INTO payments (student_id, group_id, amount, payment_date, method, notes, created_by) VALUES (?,?,?,?,?,?,?)");
                $stmt->execute([
                    $newPayload['student_id'], $newPayload['group_id'], $newPayload['amount'], $newPayload['payment_date'], $newPayload['method'], $newPayload['notes'], $newPayload['created_by']
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

                // Notify users with payment_approve permission
                try {
                    $currentUserId = $GLOBALS['jwt_user']['id'] ?? 0;
                    // Get student name for notification message
                    $stuStmt = db()->prepare("SELECT first_name, last_name FROM students WHERE id = ?");
                    $stuStmt->execute([$studentId]);
                    $stuRow = $stuStmt->fetch();
                    $studentName = $stuRow ? trim($stuRow['first_name'] . ' ' . $stuRow['last_name']) : 'Unknown';
                    $formattedAmount = number_format((float)$amount, 0, '.', ',');

                    // Find users whose roles have payment_approve permission OR are developers
                    $approverStmt = db()->prepare("
                        SELECT DISTINCT u.id FROM users u
                        WHERE u.is_active = true AND u.id != ?
                          AND (
                            u.role = 'developer'
                            OR u.role IN (
                              SELECT rp.role FROM role_permissions rp WHERE rp.feature = 'payment_approve'
                            )
                          )
                    ");
                    $approverStmt->execute([$currentUserId]);
                    $approvers = $approverStmt->fetchAll(PDO::FETCH_COLUMN);
                    foreach ($approvers as $approverId) {
                        createNotification(
                            (int)$approverId,
                            'payment_approval',
                            'New payment pending approval',
                            "{$studentName} — {$formattedAmount}",
                            '/payments'
                        );
                    }
                } catch (Exception $e) {
                    error_log("Payment approval notification failed: " . $e->getMessage());
                }

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
                requireFeature('payments_delete');
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
                requireFeature('expenses_delete');
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
                if (!empty($input['phone']) && isPhoneTaken($input['phone'])) { jsonError('This phone number is already in use'); break; }
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
                if (array_key_exists('phone', $input) && !empty($input['phone']) && $input['phone'] !== $oldRow['phone'] && isPhoneTaken($input['phone'], 'leads', (int)$id, 'phone')) { jsonError('This phone number is already in use'); break; }
                $updates[] = "updated_at = CURRENT_TIMESTAMP";
                $values[] = $id;
                $sql = "UPDATE leads SET " . implode(', ', $updates) . " WHERE id = ?";
                db()->prepare($sql)->execute($values);
                $auditKeys = ['first_name', 'last_name', 'phone', 'source', 'status', 'priority'];
                $newAudit = $oldRow ?: [];
                foreach ($auditKeys as $k) { if (array_key_exists($k, $input)) $newAudit[$k] = $input[$k]; }
                auditLog('update', 'lead', $id, $oldRow ?: null, $newAudit ?: null);
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
            requireFeature('attendance');
            if ($method === 'GET') {
                $date = $_GET['date'] ?? date('Y-m-d');
                $group = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
                if (!$group) { jsonError('group_id required'); break; }
                $stmt = db()->prepare("
                    SELECT e.student_id, s.first_name || ' ' || s.last_name AS student_name,
                           s.phone, s.parent_phone,
                           a.id AS attendance_id, a.status AS attendance_status,
                           u.name AS marked_by_name
                    FROM enrollments e
                    JOIN students s ON e.student_id = s.id
                    LEFT JOIN attendance a ON a.student_id = e.student_id AND a.group_id = e.group_id AND a.attendance_date = ?
                    LEFT JOIN users u ON a.marked_by = u.id
                    WHERE e.group_id = ? AND s.deleted_at IS NULL AND s.status = 'active'
                    ORDER BY s.last_name, s.first_name
                ");
                $stmt->execute([$date, $group]);
                jsonResponse(['date' => $date, 'group_id' => $group, 'rows' => $stmt->fetchAll()]);
            } elseif ($method === 'POST') {
                $date = $input['date'] ?? date('Y-m-d');
                if ($date > date('Y-m-d')) {
                    jsonError('Cannot save attendance for future dates');
                    break;
                }
                // 48h edit lock for non-admin roles
                $roleStr = $GLOBALS['jwt_user']['role'] ?? '';
                $userRoles = array_map('trim', explode(',', $roleStr));
                $isAdmin = count(array_intersect($userRoles, ['admin','owner','developer'])) > 0;
                if (!$isAdmin && strtotime($date) < strtotime('-2 days')) {
                    jsonError('Attendance locked after 48 hours. Contact admin.', 403);
                    break;
                }
                $group = (int)($input['group_id'] ?? 0);
                $rows = $input['rows'] ?? [];
                $markedBy = $GLOBALS['jwt_user']['id'] ?? null;
                $fetchOld = db()->prepare("SELECT id, student_id, group_id, attendance_date, status FROM attendance WHERE student_id = ? AND group_id = ? AND attendance_date = ?");
                $attendanceOld = [];
                $attendanceNew = [];
                foreach ($rows as $r) {
                    $sid = (int)($r['student_id'] ?? 0);
                    $status = $r['status'] ?? 'present';
                    if (!$sid || !$group) continue;
                    $fetchOld->execute([$sid, $group, $date]);
                    $oldRow = $fetchOld->fetch();
                    db()->prepare("INSERT INTO attendance (student_id, group_id, attendance_date, status, marked_by) VALUES (?,?,?,?,?) ON CONFLICT (student_id, group_id, attendance_date) DO UPDATE SET status = ?, marked_by = ?")
                        ->execute([$sid, $group, $date, $status, $markedBy, $status, $markedBy]);
                    $oldStatus = $oldRow ? $oldRow['status'] : null;
                    if ($oldStatus !== $status) {
                        $attendanceOld[$sid] = $oldStatus;
                        $attendanceNew[$sid] = $status;

                        // Telegram: notify parent if marked absent or late
                        if (in_array($status, ['absent', 'late'])) {
                            try {
                                $nameStmt = db()->prepare("SELECT first_name || ' ' || last_name AS name FROM students WHERE id = ?");
                                $nameStmt->execute([$sid]);
                                $studentName = $nameStmt->fetchColumn() ?: 'Student';
                                $groupStmt = db()->prepare("SELECT name FROM groups WHERE id = ?");
                                $groupStmt->execute([$group]);
                                $groupName = $groupStmt->fetchColumn() ?: 'Group';
                                $attId = $oldRow ? (int)$oldRow['id'] : 0;
                                if (!$attId) { $getId = db()->prepare("SELECT id FROM attendance WHERE student_id=? AND group_id=? AND attendance_date=?"); $getId->execute([$sid,$group,$date]); $attId=(int)$getId->fetchColumn(); }
                                telegramNotifyStudent($sid, "Your child {$studentName} was marked <b>{$status}</b> in {$groupName} on {$date}.", 'attendance', $attId);
                            } catch (Exception $e) { /* ignore telegram errors */ }
                        }
                    }
                }
                if (!empty($attendanceNew)) {
                    $attChanges = [];
                    foreach ($attendanceNew as $sid => $newSt) {
                        $attChanges[$sid] = ['from' => $attendanceOld[$sid] ?? null, 'to' => $newSt];
                    }
                    auditLog('update', 'attendance', $group, null,
                        ['group_id' => $group, 'date' => $date, 'changes' => $attChanges]
                    );
                }
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'attendance-history':
            requireFeature('attendance');
            if ($method === 'GET') {
                $group = isset($_GET['group_id']) ? (int)$_GET['group_id'] : null;
                if (!$group) { jsonError('group_id required'); break; }
                // Get all attendance for active enrolled students in this group
                $stmt = db()->prepare("
                    SELECT a.student_id, a.attendance_date, a.status
                    FROM attendance a
                    JOIN enrollments e ON a.student_id = e.student_id AND a.group_id = e.group_id
                    JOIN students s ON a.student_id = s.id
                    WHERE a.group_id = ? AND s.deleted_at IS NULL AND s.status = 'active'
                    ORDER BY a.student_id, a.attendance_date DESC
                ");
                $stmt->execute([$group]);
                $allRows = $stmt->fetchAll();
                // Group by student, take last 10 per student
                $byStudent = [];
                foreach ($allRows as $r) {
                    $sid = (int)$r['student_id'];
                    if (!isset($byStudent[$sid])) $byStudent[$sid] = [];
                    $byStudent[$sid][] = $r;
                }
                $result = [];
                foreach ($byStudent as $sid => $records) {
                    $last10 = array_slice($records, 0, 10);
                    $total = count($last10);
                    $presentCount = 0;
                    $history = [];
                    foreach ($last10 as $rec) {
                        if (in_array($rec['status'], ['present', 'late'])) $presentCount++;
                        $history[] = ['date' => $rec['attendance_date'], 'status' => $rec['status']];
                    }
                    $percentage = $total > 0 ? round($presentCount / $total * 100, 1) : 0;
                    $result[] = [
                        'student_id' => $sid,
                        'total' => $total,
                        'present_count' => $presentCount,
                        'percentage' => $percentage,
                        'history' => array_reverse($history),
                    ];
                }
                jsonResponse($result);
            } else { jsonError('Method not allowed', 405); }
            break;

        case 'attendance-unmarked':
            requireFeature('attendance');
            if ($method === 'GET') {
                $today = date('Y-m-d');
                $dayAbbr = strtolower(date('D')); // mon, tue, wed, etc.
                $stmt = db()->prepare("
                    SELECT g.id, g.name, g.teacher_id, t.first_name || ' ' || t.last_name AS teacher_name,
                           g.schedule_time_start
                    FROM groups g
                    LEFT JOIN teachers t ON g.teacher_id = t.id
                    WHERE g.status = 'active'
                      AND g.schedule_days ILIKE ?
                      AND NOT EXISTS (
                          SELECT 1 FROM attendance a WHERE a.group_id = g.id AND a.attendance_date = ?
                      )
                    ORDER BY g.schedule_time_start, g.name
                ");
                $stmt->execute(['%' . $dayAbbr . '%', $today]);
                jsonResponse($stmt->fetchAll());
            } else { jsonError('Method not allowed', 405); }
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
                    $revenue = db()->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE deleted_at IS NULL AND is_approved = TRUE AND payment_date >= date_trunc('month', CURRENT_DATE)")->fetchColumn();
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
                    $revenueLastMonth = db()->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE deleted_at IS NULL AND is_approved = TRUE AND payment_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND payment_date < date_trunc('month', CURRENT_DATE)")->fetchColumn();
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
                        $revStmt = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_date BETWEEN ? AND ? AND deleted_at IS NULL AND is_approved = TRUE");
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
                $inc = db()->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date BETWEEN ? AND ? AND deleted_at IS NULL AND is_approved = TRUE");
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
                        $afterEnrollmentDiscount = $groupPrice * (1 - $discount / 100);
                        // Subtract monthly discount
                        $mdStmt = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM monthly_discounts WHERE student_id = ? AND group_id = ? AND for_month = ? AND deleted_at IS NULL");
                        $mdStmt->execute([(int)$e['student_id'], $groupId, $monthStart]);
                        $mdAmount = (float)$mdStmt->fetchColumn();
                        $monthlyDebt = max(0, $afterEnrollmentDiscount - $mdAmount);
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
                            WHERE p.group_id = ? AND pm.for_month = ? AND p.student_id IN ($placeholders) AND p.deleted_at IS NULL AND p.is_approved = TRUE
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

                // Get total expenses for this month
                $expStmt = db()->prepare("
                    SELECT COALESCE(SUM(amount), 0) AS total
                    FROM expenses
                    WHERE expense_date >= ? AND expense_date <= ? AND deleted_at IS NULL
                ");
                $expStmt->execute([$monthStart, $monthEnd]);
                $monthlyExpenses = round((float)$expStmt->fetchColumn(), 2);
                $totals['monthly_expenses'] = $monthlyExpenses;
                $totals['net_profit'] = round($totals['collected_amount'] - $monthlyExpenses, 2);

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
                if (!empty($input['phone']) && isPhoneTaken($input['phone'])) { jsonError('This phone number is already in use'); break; }
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
                if (array_key_exists('phone', $input) && !empty($input['phone']) && isPhoneTaken($input['phone'], 'users', (int)$id, 'phone')) { jsonError('This phone number is already in use'); break; }
                if ($sets) {
                    $oldStmt = db()->prepare("SELECT username, name, role, email, phone, is_active FROM users WHERE id = ?");
                    $oldStmt->execute([$id]);
                    $oldRow = $oldStmt->fetch();
                    $params[] = $id;
                    $stmt = db()->prepare("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?");
                    $stmt->execute($params);
                    $auditUserKeys = ['username', 'name', 'role', 'email', 'phone', 'is_active'];
                    $newUserAudit = $oldRow ?: [];
                    foreach ($auditUserKeys as $k) { if (array_key_exists($k, $input)) $newUserAudit[$k] = $input[$k]; }
                    auditLog('update', 'user', $id, $oldRow ?: null, $newUserAudit ?: null);
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
            $afterEnrollmentDiscount = $groupPrice * (1 - $discountPct / 100);

            // Get monthly discount for this student+group+month
            $monthStart = $month . '-01';
            $mdStmt = db()->prepare("
                SELECT COALESCE(SUM(amount), 0) FROM monthly_discounts
                WHERE student_id = ? AND group_id = ? AND for_month = ? AND deleted_at IS NULL
            ");
            $mdStmt->execute([$studentId, $groupId, $monthStart]);
            $monthlyDiscountAmount = (float)$mdStmt->fetchColumn();
            $monthlyDebt = max(0, $afterEnrollmentDiscount - $monthlyDiscountAmount);

            // Get paid amount for this month
            $paidStmt = db()->prepare("
                SELECT COALESCE(SUM(pm.amount), 0) AS paid
                FROM payment_months pm
                JOIN payments p ON pm.payment_id = p.id
                WHERE p.student_id = ? AND p.group_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE
            ");
            $paidStmt->execute([$studentId, $groupId, $monthStart]);
            $paidAmount = (float)$paidStmt->fetchColumn();
            // Credit from payments made this month in groups student is no longer enrolled in
            $tcStmt2 = db()->prepare("
                SELECT COALESCE(SUM(pm.amount), 0)
                FROM payment_months pm
                JOIN payments p ON pm.payment_id = p.id
                LEFT JOIN enrollments ecur ON ecur.student_id = p.student_id AND ecur.group_id = p.group_id
                WHERE p.student_id = ? AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE
                  AND ecur.id IS NULL AND p.group_id != ?
            ");
            $tcStmt2->execute([$studentId, $monthStart, $groupId]);
            $transferCredit2 = (float)$tcStmt2->fetchColumn();
            $remainingDebt = max(0, $monthlyDebt - $paidAmount - $transferCredit2);

            jsonResponse([
                'student_id' => $studentId,
                'group_id' => $groupId,
                'month' => $month,
                'group_price' => $groupPrice,
                'discount_percentage' => $discountPct,
                'monthly_discount' => round($monthlyDiscountAmount, 2),
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
                    s.parent_name,
                    s.parent_phone,
                    g.price AS group_price,
                    e.discount_percentage,
                    g.price * (1 - COALESCE(e.discount_percentage, 0) / 100) AS expected_before_md,
                    COALESCE(
                        (SELECT json_agg(json_build_object('group_id', g2.id, 'group_name', g2.name))
                         FROM enrollments e2
                         JOIN groups g2 ON e2.group_id = g2.id
                         WHERE e2.student_id = s.id),
                        '[]'
                    ) AS enrollments_json,
                    COALESCE(
                        (SELECT SUM(pm.amount)
                         FROM payment_months pm
                         JOIN payments p ON pm.payment_id = p.id
                         WHERE p.student_id = s.id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE),
                        0
                    ) +
                    COALESCE(
                        (SELECT SUM(pm.amount)
                         FROM payment_months pm
                         JOIN payments p ON pm.payment_id = p.id
                         WHERE p.student_id = s.id AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE
                           AND p.group_id NOT IN (SELECT group_id FROM enrollments WHERE student_id = s.id)),
                        0
                    ) AS paid,
                    COALESCE(
                        (SELECT SUM(md.amount)
                         FROM monthly_discounts md
                         WHERE md.student_id = s.id AND md.group_id = e.group_id AND md.for_month = ? AND md.deleted_at IS NULL),
                        0
                    ) AS monthly_discount,
                    cc_agg.last_call_date,
                    cc_agg.last_call_notes,
                    cc_agg.call_count
                FROM enrollments e
                JOIN students s ON e.student_id = s.id
                JOIN groups g ON e.group_id = g.id
                LEFT JOIN (
                    SELECT
                        cc.student_id,
                        MAX(cc.created_at) AS last_call_date,
                        (SELECT cc2.notes FROM collection_calls cc2 WHERE cc2.student_id = cc.student_id ORDER BY cc2.created_at DESC LIMIT 1) AS last_call_notes,
                        COUNT(*) AS call_count
                    FROM collection_calls cc
                    GROUP BY cc.student_id
                ) cc_agg ON cc_agg.student_id = s.id
                WHERE e.group_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
                ORDER BY s.first_name, s.last_name
            ");
            $stmt->execute([$monthStart, $monthStart, $monthStart, $groupId]);
            $rows = $stmt->fetchAll();
            $result = [];
            foreach ($rows as $row) {
                $expected = round(max(0, (float)$row['expected_before_md'] - (float)$row['monthly_discount']), 2);
                $paid = round((float)$row['paid'], 2);
                $debt = round(max(0, $expected - $paid), 2);
                $result[] = [
                    'id' => (int)$row['id'],
                    'first_name' => $row['first_name'],
                    'last_name' => $row['last_name'],
                    'phone' => $row['phone'],
                    'parent_name' => $row['parent_name'],
                    'parent_phone' => $row['parent_phone'],
                    'enrollments' => json_decode($row['enrollments_json'], true) ?: [],
                    'expected' => $expected,
                    'paid' => $paid,
                    'debt' => $debt,
                    'monthly_discount' => round((float)$row['monthly_discount'], 2),
                    'last_call_date' => $row['last_call_date'],
                    'last_call_notes' => $row['last_call_notes'],
                    'call_count' => (int)($row['call_count'] ?? 0),
                ];
            }
            jsonResponse($result);
            break;

        case 'collections':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $monthParam = $_GET['month'] ?? date('Y-m');
                $currentMonth = $monthParam . '-01';
                $stmt = db()->prepare("
                    SELECT
                        s.id,
                        s.first_name,
                        s.last_name,
                        s.phone,
                        s.parent_name,
                        s.parent_phone,
                        COALESCE(
                            (SELECT json_agg(json_build_object(
                                'group_id', g.id, 'group_name', g.name, 'price', g.price, 'discount', e.discount_percentage,
                                'monthly_discount', COALESCE((SELECT SUM(md2.amount) FROM monthly_discounts md2 WHERE md2.student_id = e.student_id AND md2.group_id = e.group_id AND md2.for_month = ? AND md2.deleted_at IS NULL), 0)
                             ))
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
                        SELECT student_id, expected, paid FROM (
                            SELECT
                                e.student_id,
                                SUM(GREATEST(0,
                                    g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)
                                    - COALESCE(md_s.discount, 0)
                                )) AS expected,
                                COALESCE(SUM(COALESCE(pm_g.paid, 0)), 0)
                                    + COALESCE(MAX(COALESCE(tc.transfer_credit, 0)), 0) AS paid
                            FROM enrollments e
                            JOIN groups g ON e.group_id = g.id
                            LEFT JOIN (
                                SELECT student_id, group_id, SUM(amount) AS discount
                                FROM monthly_discounts
                                WHERE for_month = ? AND deleted_at IS NULL
                                GROUP BY student_id, group_id
                            ) md_s ON md_s.student_id = e.student_id AND md_s.group_id = e.group_id
                            LEFT JOIN (
                                SELECT p.student_id, p.group_id, SUM(pm.amount) AS paid
                                FROM payments p
                                JOIN payment_months pm ON pm.payment_id = p.id
                                WHERE pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE
                                GROUP BY p.student_id, p.group_id
                            ) pm_g ON pm_g.student_id = e.student_id AND pm_g.group_id = e.group_id
                            LEFT JOIN (
                                SELECT p.student_id, SUM(pm.amount) AS transfer_credit
                                FROM payments p
                                JOIN payment_months pm ON pm.payment_id = p.id
                                LEFT JOIN enrollments ecur ON ecur.student_id = p.student_id AND ecur.group_id = p.group_id
                                WHERE pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE AND ecur.id IS NULL
                                GROUP BY p.student_id
                            ) tc ON tc.student_id = e.student_id
                            GROUP BY e.student_id
                        ) t WHERE expected > paid
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
                $stmt->execute([$currentMonth, $currentMonth, $currentMonth, $currentMonth]);
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

        case 'collection-stats':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method !== 'GET') { jsonError('Method not allowed', 405); break; }
            $today = date('Y-m-d');
            $monthStart = date('Y-m-01');
            $callsToday = (int)db()->prepare("SELECT COUNT(*) FROM collection_calls WHERE created_at::date = ?")->execute([$today]) ? 0 : 0;
            $stmtToday = db()->prepare("SELECT COUNT(*) FROM collection_calls WHERE created_at::date = ?");
            $stmtToday->execute([$today]);
            $callsToday = (int)$stmtToday->fetchColumn();
            $stmtMonth = db()->prepare("SELECT COUNT(*) FROM collection_calls WHERE created_at >= ?");
            $stmtMonth->execute([$monthStart]);
            $callsThisMonth = (int)$stmtMonth->fetchColumn();
            jsonResponse(['calls_today' => $callsToday, 'calls_this_month' => $callsThisMonth]);
            break;

        case 'collection-student-history':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method !== 'GET') { jsonError('Method not allowed', 405); break; }
            $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
            $monthParam = $_GET['month'] ?? date('Y-m');
            if (!$studentId) { jsonError('student_id required'); break; }
            $monthStart = $monthParam . '-01';
            $stmt = db()->prepare("
                SELECT p.id, p.amount, p.payment_date, p.method, p.notes, p.created_at,
                       g.name AS group_name,
                       COALESCE(pm.month_amount, p.amount) AS month_amount
                FROM payments p
                LEFT JOIN groups g ON p.group_id = g.id
                LEFT JOIN (
                    SELECT payment_id, SUM(amount) AS month_amount
                    FROM payment_months WHERE for_month = ?
                    GROUP BY payment_id
                ) pm ON pm.payment_id = p.id
                WHERE p.student_id = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE
                  AND (pm.payment_id IS NOT NULL OR p.payment_date >= ? AND p.payment_date < (?::date + INTERVAL '1 month'))
                ORDER BY p.payment_date DESC
            ");
            $stmt->execute([$monthStart, $studentId, $monthStart, $monthStart]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$row) {
                $row['amount'] = round((float)$row['amount'], 2);
                $row['month_amount'] = round((float)$row['month_amount'], 2);
            }
            jsonResponse($rows);
            break;

        case 'collection-groups':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method !== 'GET') { jsonError('Method not allowed', 405); break; }
            $monthParam = $_GET['month'] ?? date('Y-m');
            $monthStart = $monthParam . '-01';
            $stmt = db()->prepare("
                SELECT
                    g.id,
                    g.name,
                    COUNT(DISTINCT CASE WHEN
                        GREATEST(0,
                            g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)
                            - COALESCE((SELECT SUM(md.amount) FROM monthly_discounts md WHERE md.student_id = e.student_id AND md.group_id = e.group_id AND md.for_month = ? AND md.deleted_at IS NULL), 0)
                        )
                        - COALESCE(
                            (SELECT COALESCE(SUM(pm.amount), 0) FROM payment_months pm JOIN payments p ON pm.payment_id = p.id WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE),
                            0
                        ) > 0 THEN e.student_id END
                    ) AS debtor_count,
                    COUNT(DISTINCT e.student_id) AS total_students,
                    SUM(
                        GREATEST(0,
                            GREATEST(0,
                                g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)
                                - COALESCE((SELECT SUM(md.amount) FROM monthly_discounts md WHERE md.student_id = e.student_id AND md.group_id = e.group_id AND md.for_month = ? AND md.deleted_at IS NULL), 0)
                            )
                            - COALESCE(
                                (SELECT COALESCE(SUM(pm.amount), 0) FROM payment_months pm JOIN payments p ON pm.payment_id = p.id WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE),
                                0
                            )
                        )
                    ) AS total_debt
                FROM enrollments e
                JOIN groups g ON e.group_id = g.id
                JOIN students s ON e.student_id = s.id
                WHERE s.status = 'active' AND s.deleted_at IS NULL
                GROUP BY g.id, g.name
                HAVING COUNT(DISTINCT CASE WHEN
                    GREATEST(0,
                        g.price * (1 - COALESCE(e.discount_percentage, 0) / 100)
                        - COALESCE((SELECT SUM(md.amount) FROM monthly_discounts md WHERE md.student_id = e.student_id AND md.group_id = e.group_id AND md.for_month = ? AND md.deleted_at IS NULL), 0)
                    )
                    - COALESCE(
                        (SELECT COALESCE(SUM(pm.amount), 0) FROM payment_months pm JOIN payments p ON pm.payment_id = p.id WHERE p.student_id = e.student_id AND p.group_id = e.group_id AND pm.for_month = ? AND p.deleted_at IS NULL AND p.is_approved = TRUE),
                        0
                    ) > 0 THEN e.student_id END) > 0
                ORDER BY total_debt DESC
            ");
            $stmt->execute([$monthStart, $monthStart, $monthStart, $monthStart, $monthStart, $monthStart]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$row) {
                $row['id'] = (int)$row['id'];
                $row['debtor_count'] = (int)$row['debtor_count'];
                $row['total_students'] = (int)$row['total_students'];
                $row['total_debt'] = round((float)$row['total_debt'], 2);
            }
            jsonResponse($rows);
            break;

        case 'birthdays':
            requireRole(['admin', 'manager', 'teacher', 'accountant', 'user']);
            if ($method === 'GET') {
                // Students with today's birthday
                $students = db()->query("
                    SELECT id, first_name, last_name, dob, phone, status,
                           'student' AS type, NULL AS position, NULL AS department
                    FROM students
                    WHERE deleted_at IS NULL
                      AND dob IS NOT NULL
                      AND EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM CURRENT_DATE)
                      AND EXTRACT(DAY FROM dob) = EXTRACT(DAY FROM CURRENT_DATE)
                    ORDER BY first_name, last_name
                ")->fetchAll();
                // Employees (including teachers) with today's birthday
                $employees = db()->query("
                    SELECT id, full_name AS first_name, '' AS last_name,
                           birthday AS dob, phone, status,
                           'employee' AS type, position, department
                    FROM employees
                    WHERE deleted_at IS NULL
                      AND status = 'active'
                      AND birthday IS NOT NULL
                      AND EXTRACT(MONTH FROM birthday) = EXTRACT(MONTH FROM CURRENT_DATE)
                      AND EXTRACT(DAY FROM birthday) = EXTRACT(DAY FROM CURRENT_DATE)
                    ORDER BY full_name
                ")->fetchAll();
                jsonResponse(array_merge($students, $employees));
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
                    // Telegram: notify student about unpaid balance
                    try {
                        $remaining = round($us['expected'] - $us['paid']);
                        telegramNotifyStudent((int)$us['student_id'], "Payment reminder: {$us['student_name']} has an outstanding balance of {$remaining} for {$us['group_name']} this month.", 'payment_reminder', (int)$us['student_id']);
                    } catch (Exception $e) { /* ignore telegram errors */ }
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

        case 'permissions':
            if ($method === 'GET') {
                // Any authenticated user can read the permissions table —
                // the frontend needs it to know which sidebar items to show.
                auth();
                $stmt = db()->query("SELECT role, feature FROM role_permissions ORDER BY feature, role");
                $map = [];
                foreach ($stmt->fetchAll() as $row) {
                    $map[$row['feature']][] = $row['role'];
                }
                jsonResponse($map);
            } elseif ($method === 'PUT') {
                requireFeature('permissions');
                $body = json_decode(file_get_contents('php://input'), true) ?? [];
                db()->beginTransaction();
                db()->exec("DELETE FROM role_permissions");
                $stmt = db()->prepare("INSERT INTO role_permissions (role, feature) VALUES (?, ?) ON CONFLICT DO NOTHING");
                foreach ($body as $feat => $roles) {
                    if (!is_array($roles)) continue;
                    foreach ($roles as $role) {
                        $stmt->execute([(string)$role, (string)$feat]);
                    }
                }
                db()->commit();
                jsonResponse(['ok' => true]);
            } else { jsonError('Method not allowed', 405); }
            break;

        case 'translations':
            if ($method === 'GET') {
                // Public endpoint — no auth required so login page can fetch translations
                $lang = $_GET['lang'] ?? 'en';
                if (!in_array($lang, ['en', 'uz'])) $lang = 'en';
                $stmt = db()->prepare("SELECT key, value FROM translations WHERE lang = ? ORDER BY key");
                $stmt->execute([$lang]);
                $map = [];
                foreach ($stmt->fetchAll() as $row) {
                    $map[$row['key']] = $row['value'];
                }
                jsonResponse($map);
            } elseif ($method === 'PUT') {
                requireFeature('translations');
                $body = json_decode(file_get_contents('php://input'), true) ?? [];
                // body: [{lang, key, value}, ...]
                db()->beginTransaction();
                $stmt = db()->prepare("INSERT INTO translations (lang, key, value) VALUES (?, ?, ?) ON CONFLICT (lang, key) DO UPDATE SET value = EXCLUDED.value");
                foreach ($body as $item) {
                    if (!isset($item['lang'], $item['key'], $item['value'])) continue;
                    if (!in_array($item['lang'], ['en', 'uz'])) continue;
                    $stmt->execute([(string)$item['lang'], (string)$item['key'], (string)$item['value']]);
                }
                db()->commit();
                jsonResponse(['ok' => true]);
            } else { jsonError('Method not allowed', 405); }
            break;

        case 'telegram-webhook':
            // Public endpoint — Telegram sends updates here (no auth)

            // ── Bot translation strings ─────────────────────────────────
            $BOT_LANG = [
                'en' => [
                    'btn_balance'  => '💰 Balance',  'btn_schedule' => '📅 Schedule',
                    'btn_support'  => '🎧 Support',  'btn_help'     => '❓ Help',
                    'btn_lang'     => '🌐 Language',
                    'share_phone_prompt' => "👋 Welcome to Learning Center!\n\nPlease share your phone number to link your account:",
                    'share_phone_btn'    => '📱 Share my phone number',
                    'welcome_back'       => "👋 Welcome back! Your account is already linked.",
                    'already_linked'     => "✅ Your account is already linked.",
                    'phone_not_found'    => "❌ Phone number not found. Please contact the admin.",
                    'not_linked_student' => "❌ This command is only available for linked students.\nUse /start to link your account.",
                    'welcome_linked_student' => "✅ Linked! Welcome, <b>%s</b>!\n\nChoose your language first:",
                    'welcome_linked_other'   => "✅ Linked! Welcome, <b>%s</b>!\n\nYou will now receive notifications.",
                    'choose_lang'  => "🌐 Choose your language / Tilni tanlang:",
                    'lang_saved_en'=> "✅ Language set to English.",
                    'lang_saved_uz'=> "✅ Til o'zbek tiliga o'zgartirildi.",
                    'no_enrollments' => "You have no active enrollments.",
                    'balance_title'  => "💰 <b>Balance — %s</b>\n\n",
                    'balance_fee'    => 'Fee', 'balance_paid' => 'Paid', 'balance_debt' => 'Debt',
                    'total_debt'     => "📊 Total debt: <b>%s</b>",
                    'schedule_title' => "📅 <b>Your Schedule</b>\n\n",
                    'room_label'     => 'Room',
                    'support_active' => "📋 You already have an active support request:\n\n📅 %s at %s\n%s Status: %s\n\nPlease wait for your session or contact the admin to cancel.",
                    'support_title'  => "🎧 <b>Book a Support Session</b>\n\nSelect an available time slot:",
                    'support_no_slots' => "😔 No available slots in the next 5 days. Please try again later.",
                    'support_booked'   => "✅ <b>Support session booked!</b>\n\n📅 %s at %s\n⏳ Pending confirmation\n\nYou'll be notified once confirmed.",
                    'support_slot_taken'  => "😔 This slot was just taken. Send /support to see updated slots.",
                    'support_has_active'  => "❌ You already have an active support request. Please wait for your session.",
                    'support_unavailable' => "❌ This slot is no longer available.",
                    'support_too_soon'    => "⏰ Please select a slot at least 3 hours from now.",
                    'support_ask_topic'   => "📝 What topic do you need help with? Please describe your question briefly:",
                    'help_text' => "📋 <b>Commands:</b>\n\n💰 Balance — monthly fee &amp; debt\n📅 Schedule — class schedule\n🎧 Support — book a support session\n❓ Help — show this list\n🌐 Language — change language",
                    'link_error'  => "❌ Please link your account first using /start.",
                    'invalid_code'=> "❌ Invalid or expired link code.",
                    'which_child'  => "👨‍👩‍👧 Which student are you the parent of?",
                    'linked_notify'=> "✅ Linked! You will now receive notifications.",
                ],
                'uz' => [
                    'btn_balance'  => '💰 Balans',   'btn_schedule' => '📅 Jadval',
                    'btn_support'  => '🎧 Supportga ariza',  'btn_help'     => '❓ Yordam',
                    'btn_lang'     => '🌐 Til',
                    'share_phone_prompt' => "👋 O'quv markaziga xush kelibsiz!\n\nHisobingizni ulash uchun telefon raqamingizni yuboring:",
                    'share_phone_btn'    => '📱 Telefon raqamni yuborish',
                    'welcome_back'       => "👋 Xush kelibsiz! Hisobingiz allaqachon ulangan.",
                    'already_linked'     => "✅ Hisobingiz allaqachon ulangan.",
                    'phone_not_found'    => "❌ Telefon raqam topilmadi. Admin bilan bog'laning.",
                    'not_linked_student' => "❌ Bu buyruq faqat ulangan o'quvchilar uchun.\nHisobingizni ulash uchun /start yuboring.",
                    'welcome_linked_student' => "✅ Ulandi! Xush kelibsiz, <b>%s</b>!\n\nAvval tilni tanlang:",
                    'welcome_linked_other'   => "✅ Ulandi! Xush kelibsiz, <b>%s</b>!\n\nEndi xabarnomalar olasiz.",
                    'choose_lang'  => "🌐 Choose your language / Tilni tanlang:",
                    'lang_saved_en'=> "✅ Language set to English.",
                    'lang_saved_uz'=> "✅ Til o'zbek tiliga o'zgartirildi.",
                    'no_enrollments' => "Sizda faol guruhlar yo'q.",
                    'balance_title'  => "💰 <b>%s uchun balans</b>\n\n",
                    'balance_fee'    => "To'lov", 'balance_paid' => "To'langan", 'balance_debt' => 'Qarz',
                    'total_debt'     => "📊 Umumiy qarz: <b>%s</b>",
                    'schedule_title' => "📅 <b>Dars jadvalingiz</b>\n\n",
                    'room_label'     => 'Xona',
                    'support_active' => "📋 Sizda faol so'rov mavjud:\n\n📅 %s soat %s\n%s Holat: %s\n\nSessiyangizni kuting yoki adminni chaqiring.",
                    'support_title'  => "🎧 <b>Qo'llab-quvvatlash sessiyasiga yoziling</b>\n\nMavjud vaqtni tanlang:",
                    'support_no_slots' => "😔 Kelasi 5 kun ichida bo'sh vaqt yo'q. Keyinroq urinib ko'ring.",
                    'support_booked'   => "✅ <b>Sessiya band qilindi!</b>\n\n📅 %s soat %s\n⏳ Tasdiqlanmoqda\n\nTasdiqlanganda xabar olasiz.",
                    'support_slot_taken'  => "😔 Bu vaqt band bo'ldi. Yangi vaqtlar uchun /support yuboring.",
                    'support_has_active'  => "❌ Sizda faol so'rov mavjud. Sessiyangizni kuting.",
                    'support_unavailable' => "❌ Bu vaqt endi mavjud emas.",
                    'support_too_soon'    => "⏰ Iltimos, hozirdan kamida 3 soat keyingi vaqtni tanlang.",
                    'support_ask_topic'   => "📝 Qaysi mavzu bo'yicha yordam kerak? Savolingizni qisqacha yozing:",
                    'help_text' => "📋 <b>Buyruqlar:</b>\n\n💰 Balans — oylik to'lov va qarz\n📅 Jadval — dars jadvali\n🎧 Supportga ariza — qo'llab-quvvatlash sessiyasi\n❓ Yordam — shu ro'yxat\n🌐 Til — tilni o'zgartirish",
                    'link_error'  => "❌ Avval /start orqali hisobingizni ulang.",
                    'invalid_code'=> "❌ Noto'g'ri yoki muddati o'tgan kod.",
                    'which_child'  => "👨‍👩‍👧 Qaysi o'quvchining ota-onasisiz?",
                    'linked_notify'=> "✅ Ulandi! Endi xabarnomalar olasiz.",
                ],
            ];
            // Helper: build student reply keyboard
            $mkKeyboard = function(array $T): array {
                return ['keyboard' => [
                    [['text' => $T['btn_balance']], ['text' => $T['btn_schedule']]],
                    [['text' => $T['btn_support']], ['text' => $T['btn_help']]],
                    [['text' => $T['btn_lang']]],
                ], 'resize_keyboard' => true];
            };
            // Language selection inline keyboard (same for all langs)
            $langInlineKb = ['inline_keyboard' => [[
                ['text' => '🇬🇧 English',    'callback_data' => 'set_lang_en'],
                ['text' => "🇺🇿 O'zbekcha", 'callback_data' => 'set_lang_uz'],
            ]]];

            // Always return 200 to Telegram so it never retries (retries cause duplicate inserts)
            try {

            $msg = $input['message'] ?? null;
            if ($msg) {
                $chatId = (int)($msg['chat']['id'] ?? 0);
                $text = trim($msg['text'] ?? '');
                $contact = $msg['contact'] ?? null;
                // Normalize command: strip @botname suffix, lowercase
                $command = '';
                if (str_starts_with($text, '/')) {
                    $command = strtolower(explode('@', explode(' ', $text, 2)[0], 2)[0]);
                }
                // Fetch user language
                $lr = db()->prepare("SELECT COALESCE(language,'en') AS language FROM telegram_links WHERE chat_id = ? LIMIT 1");
                $lr->execute([$chatId]); $lr = $lr->fetch();
                $lang = $lr ? $lr['language'] : 'en';
                $T = $BOT_LANG[$lang];
                $studentKeyboard = $mkKeyboard($T);

                if ($contact) {
                    // Phone-based auto-linking
                    $rawPhone = $contact['phone_number'] ?? '';
                    $normalizedPhone = substr(preg_replace('/[^0-9]/', '', $rawPhone), -9);

                    // Check if already linked
                    $alreadyLinked = db()->prepare("SELECT tl.entity_type, tl.entity_id FROM telegram_links tl WHERE tl.chat_id = ? AND tl.linked_at IS NOT NULL");
                    $alreadyLinked->execute([$chatId]);
                    if ($alreadyLinked->fetch()) {
                        telegramSendWithReplyMarkup($chatId, "✅ Your account is already linked.", ['remove_keyboard' => true]);
                        jsonResponse(['ok' => true]);
                        break;
                    }

                    // Search order: student.phone, student.phone2, teacher.phone, lead.phone, user.phone, then parent_phone
                    $found = null;
                    $norm9 = $normalizedPhone;
                    $phoneExpr = "RIGHT(regexp_replace(COALESCE(%s,''),'[^0-9]','','g'),9)";
                    // student by phone or phone2
                    $s = db()->prepare("SELECT id, first_name || ' ' || last_name AS full_name FROM students WHERE (" . sprintf($phoneExpr,'phone') . " = ? OR " . sprintf($phoneExpr,'phone2') . " = ?) AND deleted_at IS NULL LIMIT 1");
                    $s->execute([$norm9, $norm9]); $row = $s->fetch();
                    if ($row) $found = ['type' => 'student', 'id' => $row['id'], 'name' => $row['full_name']];
                    // teacher
                    if (!$found) { $s = db()->prepare("SELECT id, first_name || ' ' || last_name AS full_name FROM teachers WHERE " . sprintf($phoneExpr,'phone') . " = ? LIMIT 1"); $s->execute([$norm9]); $row = $s->fetch(); if ($row) $found = ['type' => 'teacher', 'id' => $row['id'], 'name' => $row['full_name']]; }
                    // lead (non-closed)
                    if (!$found) { $s = db()->prepare("SELECT id, first_name || ' ' || last_name AS full_name FROM leads WHERE " . sprintf($phoneExpr,'phone') . " = ? AND status != 'closed' AND deleted_at IS NULL LIMIT 1"); $s->execute([$norm9]); $row = $s->fetch(); if ($row) $found = ['type' => 'lead', 'id' => $row['id'], 'name' => $row['full_name']]; }
                    // user (active)
                    if (!$found) { $s = db()->prepare("SELECT id, name AS full_name FROM users WHERE " . sprintf($phoneExpr,'phone') . " = ? AND is_active = true LIMIT 1"); $s->execute([$norm9]); $row = $s->fetch(); if ($row) $found = ['type' => 'user', 'id' => $row['id'], 'name' => $row['full_name']]; }
                    // parent_phone — find students
                    if (!$found) {
                        $s = db()->prepare("SELECT id, first_name || ' ' || last_name AS full_name FROM students WHERE " . sprintf($phoneExpr,'parent_phone') . " = ? AND deleted_at IS NULL ORDER BY id");
                        $s->execute([$norm9]);
                        $parentStudents = $s->fetchAll();
                        if (count($parentStudents) === 1) {
                            $found = ['type' => 'student', 'id' => $parentStudents[0]['id'], 'name' => $parentStudents[0]['full_name']];
                        } elseif (count($parentStudents) > 1) {
                            // Ask which student
                            $buttons = array_map(fn($st) => [['text' => $st['full_name'], 'callback_data' => 'link_student_' . $st['id']]], $parentStudents);
                            telegramSendWithReplyMarkup($chatId, $T['which_child'], ['inline_keyboard' => $buttons]);
                            jsonResponse(['ok' => true]);
                            break;
                        }
                    }

                    if ($found) {
                        $existing = db()->prepare("SELECT id FROM telegram_links WHERE entity_type = ? AND entity_id = ?");
                        $existing->execute([$found['type'], $found['id']]);
                        $existingRow = $existing->fetch();
                        if ($existingRow) {
                            db()->prepare("UPDATE telegram_links SET chat_id = ?, linked_at = NOW(), link_code = NULL WHERE id = ?")->execute([$chatId, $existingRow['id']]);
                        } else {
                            db()->prepare("INSERT INTO telegram_links (entity_type, entity_id, chat_id, linked_at) VALUES (?, ?, ?, NOW())")->execute([$found['type'], $found['id'], $chatId]);
                        }
                        if ($found['type'] === 'student') {
                            // Ask language first
                            telegramSendWithReplyMarkup($chatId, sprintf($T['welcome_linked_student'], htmlspecialchars($found['name'])), ['remove_keyboard' => true]);
                            telegramSendWithReplyMarkup($chatId, $T['choose_lang'], $langInlineKb);
                        } else {
                            telegramSendWithReplyMarkup($chatId, sprintf($T['welcome_linked_other'], htmlspecialchars($found['name'])), ['remove_keyboard' => true]);
                        }
                    } else {
                        telegramSendWithReplyMarkup($chatId, $T['phone_not_found'], ['remove_keyboard' => true]);
                    }

                } elseif (preg_match('#^/start\s+(\S+)$#', $text, $m)) {
                    // Code-based linking
                    $code = $m[1];
                    $stmt = db()->prepare("SELECT id, entity_type, entity_id FROM telegram_links WHERE link_code = ? AND linked_at IS NULL");
                    $stmt->execute([$code]);
                    $link = $stmt->fetch();
                    if ($link) {
                        db()->prepare("UPDATE telegram_links SET chat_id = ?, linked_at = NOW(), link_code = NULL WHERE id = ?")->execute([$chatId, $link['id']]);
                        if ($link['entity_type'] === 'student') {
                            telegramSendWithReplyMarkup($chatId, $T['choose_lang'], $langInlineKb);
                        } else {
                            telegramSend($chatId, $T['linked_notify'] ?? "✅ Linked! You will now receive notifications.", 'custom');
                        }
                    } else {
                        telegramSend($chatId, $T['invalid_code'], 'custom');
                    }

                } elseif ($command === '/start') {
                    $alreadyLinked = db()->prepare("SELECT entity_type FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                    $alreadyLinked->execute([$chatId]);
                    $linkedRow = $alreadyLinked->fetch();
                    if ($linkedRow) {
                        $markup = $linkedRow['entity_type'] === 'student' ? $studentKeyboard : ['remove_keyboard' => true];
                        telegramSendWithReplyMarkup($chatId, $T['welcome_back'], $markup);
                    } else {
                        telegramSendWithReplyMarkup($chatId, $T['share_phone_prompt'], [
                            'keyboard' => [[['text' => $T['share_phone_btn'], 'request_contact' => true]]],
                            'resize_keyboard' => true,
                            'one_time_keyboard' => true,
                        ]);
                    }

                } elseif ($command === '/balance' || $text === '💰 Balance' || $text === '💰 Balans') {
                    $linkRow = db()->prepare("SELECT entity_type, entity_id FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                    $linkRow->execute([$chatId]);
                    $link = $linkRow->fetch();
                    if (!$link || $link['entity_type'] !== 'student') {
                        telegramSend($chatId, $T['not_linked_student'], 'custom');
                    } else {
                        $studentId = (int)$link['entity_id'];
                        $stmt = db()->prepare("
                            SELECT
                                g.name AS group_name,
                                g.price,
                                e.discount_percentage,
                                COALESCE(md.amount, 0) AS monthly_discount,
                                COALESCE(SUM(pm.amount), 0) AS paid,
                                GREATEST(0, g.price * (1 - e.discount_percentage/100.0) - COALESCE(md.amount, 0) - COALESCE(SUM(pm.amount), 0)) AS debt
                            FROM enrollments e
                            JOIN groups g ON e.group_id = g.id AND g.status = 'active' AND g.deleted_at IS NULL
                            LEFT JOIN monthly_discounts md ON md.student_id = e.student_id AND md.group_id = e.group_id AND DATE_TRUNC('month', md.for_month) = DATE_TRUNC('month', CURRENT_DATE) AND md.deleted_at IS NULL
                            LEFT JOIN payments p ON p.student_id = e.student_id AND p.group_id = e.group_id AND p.deleted_at IS NULL
                            LEFT JOIN payment_months pm ON pm.payment_id = p.id AND DATE_TRUNC('month', pm.for_month) = DATE_TRUNC('month', CURRENT_DATE)
                            WHERE e.student_id = ?
                            GROUP BY g.name, g.price, e.discount_percentage, md.amount
                        ");
                        $stmt->execute([$studentId]);
                        $rows = $stmt->fetchAll();
                        if (!$rows) {
                            telegramSendWithReplyMarkup($chatId, $T['no_enrollments'], $studentKeyboard);
                        } else {
                            $month = date('F Y');
                            $balanceMsg = sprintf($T['balance_title'], $month);
                            $totalDebt = 0;
                            foreach ($rows as $row) {
                                $fee = number_format((float)$row['price'] * (1 - (float)$row['discount_percentage']/100) - (float)$row['monthly_discount'], 0, '.', ' ');
                                $paid = number_format((float)$row['paid'], 0, '.', ' ');
                                $debt = (float)$row['debt'];
                                $totalDebt += $debt;
                                $icon = $debt > 0 ? "❌" : "✅";
                                $debtStr = number_format($debt, 0, '.', ' ');
                                $balanceMsg .= "{$icon} <b>{$row['group_name']}</b>\n";
                                $balanceMsg .= "  {$T['balance_fee']}: {$fee} | {$T['balance_paid']}: {$paid} | {$T['balance_debt']}: <b>{$debtStr}</b>\n\n";
                            }
                            $totalStr = number_format($totalDebt, 0, '.', ' ');
                            $balanceMsg .= sprintf($T['total_debt'], $totalStr);
                            telegramSendWithReplyMarkup($chatId, $balanceMsg, $studentKeyboard);
                        }
                    }

                } elseif ($command === '/schedule' || $text === '📅 Schedule' || $text === '📅 Jadval') {
                    $linkRow = db()->prepare("SELECT entity_type, entity_id FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                    $linkRow->execute([$chatId]);
                    $link = $linkRow->fetch();
                    if (!$link || $link['entity_type'] !== 'student') {
                        telegramSend($chatId, $T['not_linked_student'], 'custom');
                    } else {
                        $studentId = (int)$link['entity_id'];
                        $stmt = db()->prepare("
                            SELECT g.name, g.subject, g.schedule_days, g.schedule_time_start, g.schedule_time_end, g.room,
                                   t.first_name || ' ' || t.last_name AS teacher_name
                            FROM enrollments e
                            JOIN groups g ON e.group_id = g.id AND g.status = 'active' AND g.deleted_at IS NULL
                            LEFT JOIN teachers t ON g.teacher_id = t.id
                            WHERE e.student_id = ?
                            ORDER BY g.schedule_time_start
                        ");
                        $stmt->execute([$studentId]);
                        $rows = $stmt->fetchAll();
                        if (!$rows) {
                            telegramSendWithReplyMarkup($chatId, $T['no_enrollments'], $studentKeyboard);
                        } else {
                            $schedMsg = $T['schedule_title'];
                            foreach ($rows as $row) {
                                $schedMsg .= "📚 <b>{$row['name']}</b>";
                                if ($row['subject']) $schedMsg .= " — {$row['subject']}";
                                $schedMsg .= "\n";
                                if ($row['schedule_days']) $schedMsg .= "  📆 {$row['schedule_days']}\n";
                                if ($row['schedule_time_start'] && $row['schedule_time_end']) $schedMsg .= "  🕐 " . substr($row['schedule_time_start'],0,5) . " – " . substr($row['schedule_time_end'],0,5) . "\n";
                                if ($row['room']) $schedMsg .= "  🚪 {$T['room_label']}: {$row['room']}\n";
                                if ($row['teacher_name']) $schedMsg .= "  👤 {$row['teacher_name']}\n";
                                $schedMsg .= "\n";
                            }
                            telegramSendWithReplyMarkup($chatId, $schedMsg, $studentKeyboard);
                        }
                    }

                } elseif ($command === '/support' || $text === '🎧 Support' || $text === "🎧 So'rov" || $text === '🎧 Supportga ariza') {
                    // Clear any pending support state
                    db()->prepare("UPDATE telegram_links SET pending_support_date = NULL, pending_support_time = NULL WHERE chat_id = ?")->execute([$chatId]);
                    $linkRow = db()->prepare("SELECT entity_type, entity_id FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                    $linkRow->execute([$chatId]); $link = $linkRow->fetch();
                    if (!$link || $link['entity_type'] !== 'student') {
                        telegramSend($chatId, $T['not_linked_student'], 'custom');
                    } else {
                        $studentId = (int)$link['entity_id'];
                        $existing = db()->prepare("SELECT scheduled_date, scheduled_time, status FROM support_requests WHERE student_id = ? AND status IN ('pending','confirmed') AND scheduled_date >= CURRENT_DATE ORDER BY scheduled_date, scheduled_time LIMIT 1");
                        $existing->execute([$studentId]); $existingReq = $existing->fetch();
                        if ($existingReq) {
                            $dateStr = date('d/m/Y', strtotime($existingReq['scheduled_date']));
                            $statusIcon = $existingReq['status'] === 'confirmed' ? '✅' : '⏳';
                            $statusLabel = $lang === 'uz'
                                ? ($existingReq['status'] === 'confirmed' ? 'Tasdiqlangan' : 'Kutilmoqda')
                                : ucfirst($existingReq['status']);
                            telegramSendWithReplyMarkup($chatId, sprintf($T['support_active'], $dateStr, substr($existingReq['scheduled_time'],0,5), $statusIcon, $statusLabel), $studentKeyboard);
                        } else {
                            $supportTimes = ['14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'];
                            $days = [];
                            $cur = new DateTime('today');
                            $endDate = new DateTime('+4 days');
                            while ($cur <= $endDate) {
                                $dow = (int)$cur->format('N');
                                if ($dow <= 6) $days[] = $cur->format('Y-m-d');
                                $cur->modify('+1 day');
                            }
                            if (empty($days)) {
                                telegramSendWithReplyMarkup($chatId, $T['support_no_slots'], $studentKeyboard);
                            } else {
                                $fromDate = $days[0]; $toDate = end($days);
                                $bookedStmt = db()->prepare("SELECT scheduled_date::text, scheduled_time::text FROM support_requests WHERE scheduled_date BETWEEN ? AND ? AND status != 'cancelled'");
                                $bookedStmt->execute([$fromDate, $toDate]);
                                $booked = [];
                                foreach ($bookedStmt->fetchAll() as $r) $booked[$r['scheduled_date'].'_'.substr($r['scheduled_time'],0,5)] = true;
                                $dayNames = $lang === 'uz'
                                    ? ['1'=>'Dushanba','2'=>'Seshanba','3'=>'Chorshanba','4'=>'Payshanba','5'=>'Juma','6'=>'Shanba']
                                    : ['1'=>'Monday','2'=>'Tuesday','3'=>'Wednesday','4'=>'Thursday','5'=>'Friday','6'=>'Saturday'];
                                $inlineRows = [];
                                foreach ($days as $d) {
                                    $dow = (int)(new DateTime($d))->format('N');
                                    $label = $dayNames[$dow] . ' ' . date('d/m', strtotime($d));
                                    $dayButtons = [];
                                    foreach ($supportTimes as $t) {
                                        if (!isset($booked[$d.'_'.$t])) $dayButtons[] = ['text' => $t, 'callback_data' => 'support_'.$d.'_'.$t];
                                    }
                                    if ($dayButtons) {
                                        $inlineRows[] = [['text' => "📅 {$label}", 'callback_data' => 'noop']];
                                        foreach (array_chunk($dayButtons, 4) as $chunk) $inlineRows[] = $chunk;
                                    }
                                }
                                if (empty($inlineRows)) {
                                    telegramSendWithReplyMarkup($chatId, $T['support_no_slots'], $studentKeyboard);
                                } else {
                                    telegramSendWithReplyMarkup($chatId, $T['support_title'], ['inline_keyboard' => $inlineRows]);
                                }
                            }
                        }
                    }

                } elseif ($command === '/help' || $text === '❓ Help' || $text === '❓ Yordam') {
                    telegramSendWithReplyMarkup($chatId, $T['help_text'], $studentKeyboard);

                } elseif ($text === '🌐 Language' || $text === '🌐 Til' || $command === '/language') {
                    telegramSendWithReplyMarkup($chatId, $T['choose_lang'], $langInlineKb);

                } else {
                    // Check for pending support topic input
                    $pendingRow = db()->prepare("SELECT pending_support_date::text AS pending_support_date, pending_support_time FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL AND pending_support_date IS NOT NULL");
                    $pendingRow->execute([$chatId]); $pendingSupport = $pendingRow->fetch();
                    if ($pendingSupport && $text) {
                        // Clear pending state
                        db()->prepare("UPDATE telegram_links SET pending_support_date = NULL, pending_support_time = NULL WHERE chat_id = ?")->execute([$chatId]);
                        $reqDate = $pendingSupport['pending_support_date'];
                        $reqTime = substr($pendingSupport['pending_support_time'], 0, 5);
                        $topic = trim($text);
                        // Re-validate and book
                        $linkRow2 = db()->prepare("SELECT entity_type, entity_id FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                        $linkRow2->execute([$chatId]); $link2 = $linkRow2->fetch();
                        if (!$link2 || $link2['entity_type'] !== 'student') {
                            telegramSend($chatId, $T['link_error'], 'custom');
                        } else {
                            $studentId2 = (int)$link2['entity_id'];
                            $existingReq2 = db()->prepare("SELECT id FROM support_requests WHERE student_id = ? AND status IN ('pending','confirmed') AND scheduled_date >= CURRENT_DATE LIMIT 1");
                            $existingReq2->execute([$studentId2]);
                            if ($existingReq2->fetch()) {
                                telegramSendWithReplyMarkup($chatId, $T['support_has_active'], $studentKeyboard);
                            } else {
                                $takenSlot = db()->prepare("SELECT id FROM support_requests WHERE scheduled_date = ? AND scheduled_time = ? AND status != 'cancelled'");
                                $takenSlot->execute([$reqDate, $reqTime]);
                                if ($takenSlot->fetch()) {
                                    telegramSendWithReplyMarkup($chatId, $T['support_slot_taken'], $studentKeyboard);
                                } else {
                                    db()->prepare("INSERT INTO support_requests (student_id, scheduled_date, scheduled_time, source, topic) VALUES (?,?,?,'bot',?)")->execute([$studentId2, $reqDate, $reqTime, $topic]);
                                    $dateStr2 = date('d/m/Y', strtotime($reqDate));
                                    telegramSendWithReplyMarkup($chatId, sprintf($T['support_booked'], $dateStr2, $reqTime), $studentKeyboard);
                                }
                            }
                        }
                    } else {
                        // Log incoming message
                        try {
                            $stmt = db()->prepare("INSERT INTO telegram_log (chat_id, direction, message_text, trigger_type, telegram_message_id, status) VALUES (?,?,?,?,?,?)");
                            $stmt->execute([$chatId, 'in', $text ?: '[contact/media]', 'reply', $msg['message_id'] ?? null, 'received']);
                        } catch (PDOException $e) { /* ignore */ }
                    }
                }
            }
            // Handle callback_query (inline button taps)
            $cbq = $input['callback_query'] ?? null;
            if ($cbq) {
                $cbChatId = (int)($cbq['message']['chat']['id'] ?? 0);
                $cbData   = $cbq['callback_query_id'] ?? $cbq['id'] ?? '';
                $data     = $cbq['data'] ?? '';
                // Answer the callback to clear loading spinner
                if ($cbData) {
                    $ch = curl_init('https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/answerCallbackQuery');
                    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['callback_query_id' => $cbData]), CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5]);
                    curl_exec($ch); curl_close($ch);
                }
                // Fetch language for this callback chat
                $cbLr = db()->prepare("SELECT COALESCE(language,'en') AS language FROM telegram_links WHERE chat_id = ? LIMIT 1");
                $cbLr->execute([$cbChatId]); $cbLr = $cbLr->fetch();
                $cbLang = $cbLr ? $cbLr['language'] : 'en';
                $cbT = $BOT_LANG[$cbLang];
                $cbKb = $mkKeyboard($cbT);

                if ($data === 'set_lang_en' || $data === 'set_lang_uz') {
                    $newLang = $data === 'set_lang_en' ? 'en' : 'uz';
                    db()->prepare("UPDATE telegram_links SET language = ? WHERE chat_id = ?")->execute([$newLang, $cbChatId]);
                    $cbT = $BOT_LANG[$newLang];
                    $cbKb = $mkKeyboard($cbT);
                    $confirmMsg = $newLang === 'en' ? $cbT['lang_saved_en'] : $cbT['lang_saved_uz'];
                    // Check if student to show keyboard
                    $linkRow = db()->prepare("SELECT entity_type FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                    $linkRow->execute([$cbChatId]); $linkRow = $linkRow->fetch();
                    if ($linkRow && $linkRow['entity_type'] === 'student') {
                        telegramSendWithReplyMarkup($cbChatId, $confirmMsg, $cbKb);
                    } else {
                        telegramSend($cbChatId, $confirmMsg, 'custom');
                    }
                } elseif ($data === 'noop') {
                    // Day label button — ignore
                } elseif (preg_match('/^support_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/', $data, $m)) {
                    $reqDate = $m[1]; $reqTime = $m[2];
                    // Validate date is within next 5 calendar days
                    $todayStr = date('Y-m-d'); $maxDateStr = date('Y-m-d', strtotime('+4 days'));
                    if ($reqDate < $todayStr || $reqDate > $maxDateStr) {
                        telegramSend($cbChatId, $cbT['support_unavailable'], 'custom');
                    } else {
                        // Validate slot is at least 3 hours from now
                        $slotDt = new DateTime($reqDate . ' ' . $reqTime . ':00');
                        $minDt = new DateTime('+3 hours');
                        if ($slotDt < $minDt) {
                            telegramSend($cbChatId, $cbT['support_too_soon'], 'custom');
                        } else {
                        $linkRow = db()->prepare("SELECT entity_type, entity_id FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                        $linkRow->execute([$cbChatId]); $link = $linkRow->fetch();
                        if (!$link || $link['entity_type'] !== 'student') {
                            telegramSend($cbChatId, $cbT['link_error'], 'custom');
                        } else {
                            $studentId = (int)$link['entity_id'];
                            $existing = db()->prepare("SELECT id FROM support_requests WHERE student_id = ? AND status IN ('pending','confirmed') AND scheduled_date >= CURRENT_DATE LIMIT 1");
                            $existing->execute([$studentId]);
                            if ($existing->fetch()) {
                                telegramSend($cbChatId, $cbT['support_has_active'], 'custom');
                            } else {
                                $taken = db()->prepare("SELECT id FROM support_requests WHERE scheduled_date = ? AND scheduled_time = ? AND status != 'cancelled'");
                                $taken->execute([$reqDate, $reqTime]);
                                if ($taken->fetch()) {
                                    telegramSend($cbChatId, $cbT['support_slot_taken'], 'custom');
                                } else {
                                    // Store pending slot and ask for topic
                                    db()->prepare("UPDATE telegram_links SET pending_support_date = ?, pending_support_time = ? WHERE chat_id = ?")->execute([$reqDate, $reqTime, $cbChatId]);
                                    telegramSend($cbChatId, $cbT['support_ask_topic'], 'custom');
                                }
                            }
                        }
                        } // end 3-hour check
                    } // end date range check
                } elseif (preg_match('/^link_student_(\d+)$/', $data, $m)) {
                    $studentId = (int)$m[1];
                    // Check not already linked
                    $already = db()->prepare("SELECT id FROM telegram_links WHERE chat_id = ? AND linked_at IS NOT NULL");
                    $already->execute([$cbChatId]);
                    if ($already->fetch()) {
                        telegramSendWithReplyMarkup($cbChatId, $cbT['already_linked'], ['remove_keyboard' => true]);
                    } else {
                        $nameRow = db()->prepare("SELECT first_name || ' ' || last_name AS n FROM students WHERE id = ? AND deleted_at IS NULL");
                        $nameRow->execute([$studentId]); $nameRow = $nameRow->fetch();
                        $existing = db()->prepare("SELECT id FROM telegram_links WHERE entity_type = 'student' AND entity_id = ?");
                        $existing->execute([$studentId]); $existingRow = $existing->fetch();
                        if ($existingRow) {
                            db()->prepare("UPDATE telegram_links SET chat_id = ?, linked_at = NOW(), link_code = NULL WHERE id = ?")->execute([$cbChatId, $existingRow['id']]);
                        } else {
                            db()->prepare("INSERT INTO telegram_links (entity_type, entity_id, chat_id, linked_at) VALUES ('student', ?, ?, NOW())")->execute([$studentId, $cbChatId]);
                        }
                        telegramSendWithReplyMarkup($cbChatId, sprintf($cbT['welcome_linked_student'], htmlspecialchars($nameRow['n'] ?? '')), ['remove_keyboard' => true]);
                        telegramSendWithReplyMarkup($cbChatId, $cbT['choose_lang'], $langInlineKb);
                    }
                }
            }
            } catch (Throwable $e) {
                error_log("Telegram webhook error: " . $e->getMessage());
            }
            jsonResponse(['ok' => true]);
            break;

        case 'telegram':
            requireFeature('telegram_send');

            if ($method === 'GET' && $sub === 'log') {
                // GET /telegram/log — message log with pagination
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = min(100, max(10, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                $countStmt = db()->query("SELECT COUNT(*) FROM telegram_log");
                $total = (int)$countStmt->fetchColumn();

                $stmt = db()->prepare("SELECT tl.*, u.name AS sent_by_name FROM telegram_log tl LEFT JOIN users u ON tl.sent_by = u.id ORDER BY tl.created_at DESC LIMIT ? OFFSET ?");
                $stmt->execute([$limit, $offset]);
                jsonResponse(['data' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'limit' => $limit]);

            } elseif ($method === 'GET') {
                // GET /telegram — list all links with entity names
                $stmt = db()->query("
                    SELECT tl.*,
                        CASE
                            WHEN tl.entity_type = 'student' THEN (SELECT first_name || ' ' || last_name FROM students WHERE id = tl.entity_id)
                            WHEN tl.entity_type = 'teacher' THEN (SELECT first_name || ' ' || last_name FROM teachers WHERE id = tl.entity_id)
                            WHEN tl.entity_type = 'lead' THEN (SELECT first_name || ' ' || last_name FROM leads WHERE id = tl.entity_id)
                        END AS entity_name
                    FROM telegram_links tl
                    ORDER BY tl.created_at DESC
                ");
                $links = $stmt->fetchAll();
                $botUsername = getTelegramBotUsername();
                foreach ($links as &$link) {
                    $link['bot_link'] = ($link['link_code'] && $botUsername) ? "https://t.me/{$botUsername}?start={$link['link_code']}" : '';
                }
                unset($link);
                jsonResponse($links);

            } elseif ($method === 'POST') {
                $action = $input['action'] ?? '';

                if ($action === 'generate-code') {
                    $entityType = $input['entity_type'] ?? '';
                    $entityId = (int)($input['entity_id'] ?? 0);
                    if (!in_array($entityType, ['student', 'teacher', 'lead', 'user']) || !$entityId) {
                        jsonError('Invalid entity_type or entity_id');
                        break;
                    }
                    $code = generateTelegramCode();
                    // Upsert: if link exists for this entity, update code; otherwise insert
                    $existing = db()->prepare("SELECT id FROM telegram_links WHERE entity_type = ? AND entity_id = ?");
                    $existing->execute([$entityType, $entityId]);
                    $row = $existing->fetch();
                    if ($row) {
                        $stmt = db()->prepare("UPDATE telegram_links SET link_code = ?, linked_at = NULL, chat_id = NULL WHERE id = ?");
                        $stmt->execute([$code, $row['id']]);
                    } else {
                        $stmt = db()->prepare("INSERT INTO telegram_links (entity_type, entity_id, link_code) VALUES (?, ?, ?)");
                        $stmt->execute([$entityType, $entityId, $code]);
                    }
                    $botUsername = getTelegramBotUsername();
                    $botLink = $botUsername ? "https://t.me/{$botUsername}?start={$code}" : '';
                    jsonResponse(['code' => $code, 'bot_link' => $botLink]);

                } elseif ($action === 'send') {
                    $targetType = $input['target_type'] ?? '';
                    $targetId = (int)($input['target_id'] ?? 0);
                    $messageText = trim($input['message'] ?? '');
                    if (!$messageText) { jsonError('Message is required'); break; }

                    $sentBy = $GLOBALS['jwt_user']['id'] ?? null;
                    $results = ['sent' => 0, 'failed' => 0, 'errors' => []];

                    if ($targetType === 'student') {
                        $r = telegramNotifyStudent($targetId, $messageText, 'custom', null);
                        if ($r['ok']) $results['sent']++; else { $results['failed']++; $results['errors'][] = $r['error']; }

                    } elseif ($targetType === 'teacher') {
                        $r = telegramNotifyTeacher($targetId, $messageText, 'custom', null);
                        if ($r['ok']) $results['sent']++; else { $results['failed']++; $results['errors'][] = $r['error']; }

                    } elseif ($targetType === 'lead') {
                        $stmt = db()->prepare("SELECT chat_id FROM telegram_links WHERE entity_type = 'lead' AND entity_id = ? AND linked_at IS NOT NULL");
                        $stmt->execute([$targetId]);
                        $row = $stmt->fetch();
                        if ($row && $row['chat_id']) {
                            $r = telegramSend((int)$row['chat_id'], $messageText, 'custom', null, $sentBy);
                            if ($r['ok']) $results['sent']++; else { $results['failed']++; $results['errors'][] = $r['error']; }
                        } else {
                            $results['failed']++;
                            $results['errors'][] = 'No linked Telegram account';
                        }

                    } elseif ($targetType === 'group') {
                        // Send to all enrolled students in the group
                        $stmt = db()->prepare("SELECT e.student_id FROM enrollments e JOIN students s ON e.student_id = s.id WHERE e.group_id = ? AND s.status = 'active' AND s.deleted_at IS NULL");
                        $stmt->execute([$targetId]);
                        foreach ($stmt->fetchAll() as $row) {
                            $r = telegramNotifyStudent((int)$row['student_id'], $messageText, 'custom', null);
                            if ($r['ok']) $results['sent']++; else $results['failed']++;
                        }
                    } else {
                        jsonError('Invalid target_type');
                        break;
                    }
                    jsonResponse($results);
                } elseif ($action === 'clear-queue') {
                    if (!TELEGRAM_BOT_TOKEN) { jsonError('Bot token not configured'); break; }
                    $apiBase = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN;
                    // Get current webhook URL
                    $ch = curl_init($apiBase . '/getWebhookInfo');
                    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
                    $info = json_decode(curl_exec($ch), true);
                    curl_close($ch);
                    $currentUrl = $info['result']['url'] ?? '';
                    if (!$currentUrl) { jsonError('No webhook URL set'); break; }
                    // Re-set webhook with drop_pending_updates=true, include cert if available
                    $certPath = __DIR__ . '/telegram.crt';
                    $ch = curl_init($apiBase . '/setWebhook');
                    $postFields = ['url' => $currentUrl, 'drop_pending_updates' => 'true'];
                    if (file_exists($certPath)) {
                        $postFields['certificate'] = new CURLFile($certPath, 'application/x-pem-file', 'telegram.crt');
                        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $postFields, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
                    } else {
                        curl_setopt_array($ch, [
                            CURLOPT_POST => true,
                            CURLOPT_POSTFIELDS => json_encode(['url' => $currentUrl, 'drop_pending_updates' => true]),
                            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                            CURLOPT_RETURNTRANSFER => true,
                            CURLOPT_TIMEOUT => 10,
                        ]);
                    }
                    $result = json_decode(curl_exec($ch), true);
                    curl_close($ch);
                    if (!empty($result['ok'])) {
                        jsonResponse(['ok' => true, 'message' => 'Pending updates cleared']);
                    } else {
                        jsonError($result['description'] ?? 'Failed to clear queue');
                    }
                } else {
                    jsonError('Invalid action');
                }

            } elseif ($method === 'DELETE' && $id) {
                $stmt = db()->prepare("DELETE FROM telegram_links WHERE id = ?");
                $stmt->execute([$id]);
                jsonResponse(['ok' => true]);

            } else {
                jsonError('Method not allowed', 405);
            }
            break;

        case 'monthly-discounts':
            requireRole(['admin', 'manager', 'accountant']);
            if ($method === 'GET') {
                $where = ['md.deleted_at IS NULL'];
                $params = [];
                if (!empty($_GET['student_id'])) {
                    $where[] = 'md.student_id = ?';
                    $params[] = (int)$_GET['student_id'];
                }
                if (!empty($_GET['group_id'])) {
                    $where[] = 'md.group_id = ?';
                    $params[] = (int)$_GET['group_id'];
                }
                if (!empty($_GET['month'])) {
                    $where[] = 'md.for_month = ?';
                    $params[] = $_GET['month'] . '-01';
                }
                $whereClause = implode(' AND ', $where);
                $stmt = db()->prepare("
                    SELECT md.*, s.first_name || ' ' || s.last_name AS student_name, g.name AS group_name,
                           u.name AS created_by_name
                    FROM monthly_discounts md
                    JOIN students s ON md.student_id = s.id
                    JOIN groups g ON md.group_id = g.id
                    LEFT JOIN users u ON md.created_by = u.id
                    WHERE $whereClause
                    ORDER BY md.for_month DESC, md.created_at DESC
                ");
                $stmt->execute($params);
                jsonResponse($stmt->fetchAll());
            } elseif ($method === 'POST') {
                $studentId = (int)($input['student_id'] ?? 0);
                $groupId = (int)($input['group_id'] ?? 0);
                $forMonth = $input['for_month'] ?? '';
                $amount = (float)($input['amount'] ?? 0);
                $reason = trim($input['reason'] ?? '');
                if (!$studentId || !$groupId || !$forMonth || $amount <= 0) {
                    jsonError('student_id, group_id, for_month, and positive amount required');
                    break;
                }
                // Ensure for_month is first day of month
                $forMonth = date('Y-m-01', strtotime($forMonth));
                $createdBy = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO monthly_discounts (student_id, group_id, for_month, amount, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$studentId, $groupId, $forMonth, $amount, $reason ?: null, $createdBy]);
                $newId = (int)db()->lastInsertId();
                auditLog('create', 'monthly_discount', $newId, null, [
                    'student_id' => $studentId, 'group_id' => $groupId,
                    'for_month' => $forMonth, 'amount' => $amount, 'reason' => $reason
                ]);
                jsonResponse(['id' => $newId]);
            } elseif ($id && $method === 'DELETE') {
                $old = db()->prepare("SELECT * FROM monthly_discounts WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldRow = $old->fetch();
                if (!$oldRow) { jsonError('Monthly discount not found', 404); break; }
                db()->prepare("UPDATE monthly_discounts SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                auditLog('delete', 'monthly_discount', $id, [
                    'student_id' => (int)$oldRow['student_id'], 'group_id' => (int)$oldRow['group_id'],
                    'for_month' => $oldRow['for_month'], 'amount' => (float)$oldRow['amount'], 'reason' => $oldRow['reason']
                ], null);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'employees':
            auth();
            requireFeature('employees');
            if ($method === 'GET') {
                $where = ['e.deleted_at IS NULL'];
                $params = [];
                if (!empty($_GET['department'])) {
                    $where[] = 'e.department = ?';
                    $params[] = $_GET['department'];
                }
                if (!empty($_GET['status'])) {
                    $where[] = 'e.status = ?';
                    $params[] = $_GET['status'];
                }
                $whereClause = implode(' AND ', $where);
                $stmt = db()->prepare("
                    SELECT e.*,
                           TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')) AS teacher_name,
                           (SELECT COUNT(*) FROM groups g WHERE g.teacher_id = e.teacher_id AND g.status = 'active' AND g.deleted_at IS NULL) AS group_count
                    FROM employees e
                    LEFT JOIN teachers t ON t.id = e.teacher_id
                    WHERE $whereClause
                    ORDER BY e.department, e.full_name
                ");
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$r) {
                    $r['id'] = (int)$r['id'];
                    $r['base_salary'] = (float)$r['base_salary'];
                    $r['teacher_id'] = $r['teacher_id'] ? (int)$r['teacher_id'] : null;
                    $r['group_count'] = (int)$r['group_count'];
                }
                jsonResponse($rows);
            } elseif ($method === 'POST') {
                $fullName = trim($input['full_name'] ?? '');
                $department = trim($input['department'] ?? '');
                $position = trim($input['position'] ?? '');
                if (!$fullName || !$department || !$position) {
                    jsonError('full_name, department, and position are required');
                    break;
                }
                $phone = trim($input['phone'] ?? '') ?: null;
                if (!empty($phone) && isPhoneTaken($phone)) { jsonError('This phone number is already in use'); break; }
                $hireDate = $input['hire_date'] ?? null ?: null;
                $birthday = $input['birthday'] ?? null ?: null;
                $baseSalary = (float)($input['base_salary'] ?? 0);
                $teacherId = !empty($input['teacher_id']) ? (int)$input['teacher_id'] : null;
                $status = $input['status'] ?? 'active';
                $notes = trim($input['notes'] ?? '') ?: null;
                $stmt = db()->prepare("INSERT INTO employees (full_name, department, position, phone, hire_date, birthday, base_salary, teacher_id, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?)");
                $stmt->execute([$fullName, $department, $position, $phone, $hireDate, $birthday, $baseSalary, $teacherId, $status, $notes]);
                $newId = (int)db()->lastInsertId();
                auditLog('create', 'employee', $newId, null, ['full_name' => $fullName, 'department' => $department, 'position' => $position]);
                jsonResponse(['id' => $newId]);
            } elseif ($id && $method === 'PUT') {
                $old = db()->prepare("SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL");
                $old->execute([$id]);
                $oldEmpRow = $old->fetch();
                if (!$oldEmpRow) { jsonError('Employee not found', 404); break; }
                $fullName = trim($input['full_name'] ?? '');
                $department = trim($input['department'] ?? '');
                $position = trim($input['position'] ?? '');
                if (!$fullName || !$department || !$position) {
                    jsonError('full_name, department, and position are required');
                    break;
                }
                $phone = trim($input['phone'] ?? '') ?: null;
                if (!empty($phone) && $phone !== $oldEmpRow['phone'] && isPhoneTaken($phone, 'employees', (int)$id, 'phone')) { jsonError('This phone number is already in use'); break; }
                $hireDate = $input['hire_date'] ?? null ?: null;
                $birthday = $input['birthday'] ?? null ?: null;
                $baseSalary = (float)($input['base_salary'] ?? 0);
                $teacherId = !empty($input['teacher_id']) ? (int)$input['teacher_id'] : null;
                $status = $input['status'] ?? 'active';
                $notes = trim($input['notes'] ?? '') ?: null;
                db()->prepare("UPDATE employees SET full_name=?, department=?, position=?, phone=?, hire_date=?, birthday=?, base_salary=?, teacher_id=?, status=?, notes=? WHERE id=?")
                    ->execute([$fullName, $department, $position, $phone, $hireDate, $birthday, $baseSalary, $teacherId, $status, $notes, $id]);
                auditLog('update', 'employee', $id,
                    ['full_name' => $oldEmpRow['full_name'], 'department' => $oldEmpRow['department'], 'position' => $oldEmpRow['position'], 'phone' => $oldEmpRow['phone'], 'base_salary' => $oldEmpRow['base_salary'], 'status' => $oldEmpRow['status']],
                    ['full_name' => $fullName, 'department' => $department, 'position' => $position, 'phone' => $phone, 'base_salary' => $baseSalary, 'status' => $status]
                );
                jsonResponse(['ok' => true]);
            } elseif ($id && $method === 'DELETE') {
                $delEmp = db()->prepare("SELECT full_name, department, position, status FROM employees WHERE id = ? AND deleted_at IS NULL");
                $delEmp->execute([$id]);
                $delEmpRow = $delEmp->fetch();
                db()->prepare("UPDATE employees SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL")->execute([$id]);
                auditLog('delete', 'employee', $id, $delEmpRow ?: null, null);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'salary-records':
            auth();
            requireFeature('salaries');
            if ($method === 'GET') {
                $month = $_GET['month'] ?? date('Y-m');
                $stmt = db()->prepare("
                    SELECT sr.*, e.full_name, e.department, e.position
                    FROM salary_records sr
                    JOIN employees e ON e.id = sr.employee_id
                    WHERE sr.month = ? AND e.deleted_at IS NULL
                    ORDER BY e.department, e.full_name
                ");
                $stmt->execute([$month]);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$r) {
                    $r['id'] = (int)$r['id'];
                    $r['employee_id'] = (int)$r['employee_id'];
                    $r['base_amount'] = (float)$r['base_amount'];
                    $r['bonus'] = (float)$r['bonus'];
                    $r['deduction'] = (float)$r['deduction'];
                    $r['net_amount'] = $r['base_amount'] + $r['bonus'] - $r['deduction'];
                    $r['paid'] = ($r['paid'] === true || $r['paid'] === 't' || $r['paid'] === '1');
                }
                jsonResponse($rows);
            } elseif ($method === 'POST' && $sub === 'generate') {
                // Generate salary records for all active employees for a given month
                $month = $input['month'] ?? date('Y-m');
                $stmt = db()->prepare("SELECT id, base_salary FROM employees WHERE status = 'active' AND deleted_at IS NULL");
                $stmt->execute();
                $employees = $stmt->fetchAll();
                $ins = db()->prepare("INSERT INTO salary_records (employee_id, month, base_amount) VALUES (?,?,?) ON CONFLICT (employee_id, month) DO NOTHING");
                $count = 0;
                foreach ($employees as $emp) {
                    $ins->execute([(int)$emp['id'], $month, (float)$emp['base_salary']]);
                    $count += $ins->rowCount();
                }
                jsonResponse(['generated' => $count, 'month' => $month]);
            } elseif ($id && $method === 'PUT') {
                if ($sub === 'pay') {
                    // Mark as paid
                    $paidBy = $GLOBALS['jwt_user']['id'] ?? null;
                    db()->prepare("UPDATE salary_records SET paid = TRUE, paid_at = NOW(), paid_by = ? WHERE id = ?")
                        ->execute([$paidBy, $id]);
                    jsonResponse(['ok' => true]);
                } else {
                    // Update bonus / deduction / notes
                    $bonus = (float)($input['bonus'] ?? 0);
                    $deduction = (float)($input['deduction'] ?? 0);
                    $bonusNote = trim($input['bonus_note'] ?? '') ?: null;
                    $deductionNote = trim($input['deduction_note'] ?? '') ?: null;
                    $notes = trim($input['notes'] ?? '') ?: null;
                    db()->prepare("UPDATE salary_records SET bonus=?, deduction=?, bonus_note=?, deduction_note=?, notes=? WHERE id=?")
                        ->execute([$bonus, $deduction, $bonusNote, $deductionNote, $notes, $id]);
                    jsonResponse(['ok' => true]);
                }
            } elseif ($method === 'POST' && $sub === 'pay-all') {
                // Mark all unpaid for a month as paid
                $month = $input['month'] ?? date('Y-m');
                $paidBy = $GLOBALS['jwt_user']['id'] ?? null;
                db()->prepare("UPDATE salary_records SET paid = TRUE, paid_at = NOW(), paid_by = ? WHERE month = ? AND paid = FALSE")
                    ->execute([$paidBy, $month]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'books':
            requireFeature('books');
            if ($method === 'GET' && !$id) {
                if (!empty($_GET['stats'])) {
                    // Monthly revenue report
                    $rows = db()->query("
                        SELECT
                            TO_CHAR(bi.issued_at, 'YYYY-MM') AS month,
                            COUNT(*) AS issues_count,
                            COALESCE(SUM(bi.quantity), 0) AS books_count,
                            COALESCE(SUM(bi.total_price), 0) AS total_revenue,
                            COALESCE(SUM(bi.total_price) FILTER (WHERE bi.is_paid), 0) AS paid_revenue,
                            COALESCE(SUM(bi.total_price) FILTER (WHERE NOT bi.is_paid), 0) AS unpaid_revenue
                        FROM book_issues bi
                        WHERE bi.deleted_at IS NULL
                        GROUP BY TO_CHAR(bi.issued_at, 'YYYY-MM')
                        ORDER BY month DESC
                        LIMIT 24
                    ")->fetchAll();
                    jsonResponse($rows);
                } else {
                    $rows = db()->query("
                        SELECT b.*,
                            COALESCE(SUM(bi.quantity) FILTER (WHERE bi.deleted_at IS NULL), 0) AS issued_count,
                            b.quantity - COALESCE(SUM(bi.quantity) FILTER (WHERE bi.deleted_at IS NULL), 0) AS available,
                            COALESCE(SUM(bi.total_price) FILTER (WHERE bi.deleted_at IS NULL AND NOT bi.is_paid), 0) AS unpaid_amount,
                            COALESCE(COUNT(*) FILTER (WHERE bi.deleted_at IS NULL AND NOT bi.is_paid), 0) AS unpaid_count
                        FROM books b
                        LEFT JOIN book_issues bi ON bi.book_id = b.id
                        WHERE b.deleted_at IS NULL
                        GROUP BY b.id
                        ORDER BY b.title
                    ")->fetchAll();
                    jsonResponse($rows);
                }
            } elseif ($method === 'GET' && $id) {
                $stmt = db()->prepare("SELECT * FROM books WHERE id = ? AND deleted_at IS NULL");
                $stmt->execute([$id]);
                $book = $stmt->fetch();
                if (!$book) jsonError('Not found', 404);
                jsonResponse($book);
            } elseif ($method === 'POST' && !$id) {
                $title = trim($input['title'] ?? '');
                if (!$title) jsonError('Title is required', 400);
                $price    = max(0, (float)($input['price']    ?? 0));
                $quantity = max(0, (int)  ($input['quantity'] ?? 0));
                $stmt = db()->prepare("INSERT INTO books (title, author, isbn, price, quantity, description) VALUES (?, ?, ?, ?, ?, ?) RETURNING id");
                $stmt->execute([$title, $input['author'] ?? null, $input['isbn'] ?? null, $price, $quantity, $input['description'] ?? null]);
                $row = $stmt->fetch();
                jsonResponse(['id' => (int)$row['id']]);
            } elseif ($method === 'PUT' && $id) {
                $stmt = db()->prepare("SELECT id FROM books WHERE id = ? AND deleted_at IS NULL");
                $stmt->execute([$id]);
                if (!$stmt->fetch()) jsonError('Not found', 404);
                // Validate quantity >= issued count
                if (isset($input['quantity'])) {
                    $newQty = max(0, (int)$input['quantity']);
                    $issuedStmt = db()->prepare("SELECT COALESCE(SUM(quantity), 0) FROM book_issues WHERE book_id = ? AND deleted_at IS NULL");
                    $issuedStmt->execute([$id]);
                    $issuedCount = (int)$issuedStmt->fetchColumn();
                    if ($newQty < $issuedCount) {
                        jsonError('Quantity cannot be less than already issued count (' . $issuedCount . ')', 400);
                        break;
                    }
                }
                $fields = [];
                $vals   = [];
                foreach (['title','author','isbn','description'] as $f) {
                    if (isset($input[$f])) { $fields[] = "$f = ?"; $vals[] = $input[$f]; }
                }
                if (isset($input['price']))    { $fields[] = 'price = ?';    $vals[] = max(0, (float)$input['price']); }
                if (isset($input['quantity'])) { $fields[] = 'quantity = ?'; $vals[] = max(0, (int)$input['quantity']); }
                if ($fields) {
                    $vals[] = $id;
                    db()->prepare("UPDATE books SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);
                }
                jsonResponse(['ok' => true]);
            } elseif ($method === 'DELETE' && $id) {
                requireFeature('books_delete');
                db()->prepare("UPDATE book_issues SET deleted_at = NOW() WHERE book_id = ? AND deleted_at IS NULL")->execute([$id]);
                db()->prepare("UPDATE books SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
                jsonResponse(['ok' => true]);
            } else { jsonError('Not found', 404); }
            break;

        case 'book-issues':
            requireFeature('books');
            if ($method === 'GET') {
                $bookId       = $_GET['book_id']    ?? null;
                $studentId    = $_GET['student_id'] ?? null;
                $groupId      = $_GET['group_id']   ?? null;
                $isPaidFilter = $_GET['is_paid']    ?? null;
                $page    = max(1, (int)($_GET['page']     ?? 1));
                $perPage = min(100, max(5, (int)($_GET['per_page'] ?? 20)));
                $offset  = ($page - 1) * $perPage;

                $where  = ['bi.deleted_at IS NULL'];
                $params = [];
                if ($bookId)               { $where[] = 'bi.book_id = ?';    $params[] = (int)$bookId; }
                if ($studentId)            { $where[] = 'bi.student_id = ?'; $params[] = (int)$studentId; }
                if ($groupId)              { $where[] = 'bi.student_id IN (SELECT student_id FROM enrollments WHERE group_id = ?)'; $params[] = (int)$groupId; }
                if ($isPaidFilter === '1') { $where[] = 'bi.is_paid = TRUE'; }
                elseif ($isPaidFilter === '0') { $where[] = 'bi.is_paid = FALSE'; }

                $whereClause = implode(' AND ', $where);

                $cStmt = db()->prepare("SELECT COUNT(*) FROM book_issues bi WHERE $whereClause");
                $cStmt->execute($params);
                $total = (int)$cStmt->fetchColumn();

                $dStmt = db()->prepare("
                    SELECT bi.*,
                        b.title AS book_title,
                        b.price AS book_price,
                        s.first_name || ' ' || s.last_name AS student_name
                    FROM book_issues bi
                    JOIN books b ON b.id = bi.book_id
                    JOIN students s ON s.id = bi.student_id
                    WHERE $whereClause
                    ORDER BY bi.issued_at DESC
                    LIMIT ? OFFSET ?
                ");
                $dStmt->execute(array_merge($params, [$perPage, $offset]));

                jsonResponse([
                    'data'     => $dStmt->fetchAll(),
                    'total'    => $total,
                    'page'     => $page,
                    'per_page' => $perPage,
                ]);
            } elseif ($method === 'POST') {
                $bookId = (int)($input['book_id'] ?? 0);
                $notes  = $input['notes'] ?? null;
                if (!$bookId) jsonError('book_id required', 400);

                // ── Bulk issue: students array provided ──────────────────
                if (isset($input['students']) && is_array($input['students'])) {
                    $students = array_values(array_filter($input['students'], fn($s) => !empty($s['student_id'])));
                    if (empty($students)) jsonError('No students provided', 400);

                    $totalQty = array_sum(array_map(fn($s) => max(1, (int)($s['quantity'] ?? 1)), $students));

                    db()->beginTransaction();
                    try {
                        // Lock book row (no GROUP BY allowed with FOR UPDATE)
                        $bStmt = db()->prepare("SELECT id, title, price, quantity FROM books WHERE id = ? AND deleted_at IS NULL FOR UPDATE");
                        $bStmt->execute([$bookId]);
                        $book = $bStmt->fetch();
                        if (!$book) { db()->rollBack(); jsonError('Book not found', 404); break; }

                        $cStmt = db()->prepare("SELECT COALESCE(SUM(quantity),0) FROM book_issues WHERE book_id = ? AND deleted_at IS NULL");
                        $cStmt->execute([$bookId]);
                        $issuedCount = (int)$cStmt->fetchColumn();

                        $available = (int)$book['quantity'] - $issuedCount;
                        if ($totalQty > $available) {
                            db()->rollBack();
                            jsonError('Not enough stock. Available: ' . $available . ', needed: ' . $totalQty, 400);
                            break;
                        }

                        $issuedBy = $GLOBALS['jwt_user']['id'] ?? null;
                        $iStmt = db()->prepare("
                            INSERT INTO book_issues (book_id, student_id, quantity, total_price, issued_by, notes)
                            VALUES (?, ?, ?, ?, ?, ?)
                            RETURNING id
                        ");
                        $ids = [];
                        foreach ($students as $s) {
                            $sid = (int)($s['student_id'] ?? 0);
                            $qty = max(1, (int)($s['quantity'] ?? 1));
                            if (!$sid) continue;
                            $iStmt->execute([$bookId, $sid, $qty, round((float)$book['price'] * $qty, 2), $issuedBy, $notes]);
                            $ids[] = (int)$iStmt->fetch()['id'];
                        }

                        db()->commit();
                        jsonResponse(['ids' => $ids, 'count' => count($ids)]);
                    } catch (Exception $ex) {
                        db()->rollBack();
                        jsonError($ex->getMessage(), 500);
                    }

                // ── Single issue ─────────────────────────────────────────
                } else {
                    $studentId = (int)($input['student_id'] ?? 0);
                    $qty       = max(1, (int)($input['quantity'] ?? 1));
                    if (!$studentId) jsonError('student_id required', 400);

                    db()->beginTransaction();
                    try {
                        // Lock book row
                        $bStmt = db()->prepare("SELECT id, title, price, quantity FROM books WHERE id = ? AND deleted_at IS NULL FOR UPDATE");
                        $bStmt->execute([$bookId]);
                        $book = $bStmt->fetch();
                        if (!$book) { db()->rollBack(); jsonError('Book not found', 404); break; }

                        $cStmt = db()->prepare("SELECT COALESCE(SUM(quantity),0) FROM book_issues WHERE book_id = ? AND deleted_at IS NULL");
                        $cStmt->execute([$bookId]);
                        $issuedCount = (int)$cStmt->fetchColumn();

                        $available = (int)$book['quantity'] - $issuedCount;
                        if ($qty > $available) { db()->rollBack(); jsonError('Not enough stock. Available: ' . $available, 400); break; }

                        $issuedBy = $GLOBALS['jwt_user']['id'] ?? null;
                        $iStmt = db()->prepare("
                            INSERT INTO book_issues (book_id, student_id, quantity, total_price, issued_by, notes)
                            VALUES (?, ?, ?, ?, ?, ?)
                            RETURNING id
                        ");
                        $iStmt->execute([$bookId, $studentId, $qty, round((float)$book['price'] * $qty, 2), $issuedBy, $notes]);
                        $issueId = (int)$iStmt->fetch()['id'];

                        db()->commit();
                        jsonResponse(['id' => $issueId]);
                    } catch (Exception $ex) {
                        db()->rollBack();
                        jsonError($ex->getMessage(), 500);
                    }
                }
            } elseif ($method === 'PATCH' && $id) {
                // Mark book issue as paid
                $payMethod = $input['method'] ?? 'cash';

                $stmt = db()->prepare("
                    SELECT bi.*, b.title AS book_title
                    FROM book_issues bi
                    JOIN books b ON b.id = bi.book_id
                    WHERE bi.id = ? AND bi.deleted_at IS NULL
                ");
                $stmt->execute([$id]);
                $issue = $stmt->fetch();
                if (!$issue) { jsonError('Not found', 404); break; }
                if ($issue['is_paid'] === true || $issue['is_paid'] === 't' || $issue['is_paid'] === '1' || $issue['is_paid'] === 1) {
                    jsonError('Already marked as paid', 400); break;
                }

                $issuedBy = $GLOBALS['jwt_user']['id'] ?? null;
                $today    = date('Y-m-d');

                db()->beginTransaction();
                try {
                    $payNote = 'Book: ' . $issue['book_title'];
                    $pStmt = db()->prepare("
                        INSERT INTO payments (student_id, group_id, amount, payment_date, method, notes, created_by, is_approved, approved_at)
                        VALUES (?, NULL, ?, ?, ?, ?, ?, TRUE, NOW())
                        RETURNING id
                    ");
                    $pStmt->execute([$issue['student_id'], $issue['total_price'], $today, $payMethod, $payNote, $issuedBy]);
                    $paymentId = (int)$pStmt->fetch()['id'];

                    db()->prepare("UPDATE book_issues SET is_paid = TRUE, payment_id = ? WHERE id = ?")->execute([$paymentId, $id]);

                    db()->commit();
                    jsonResponse(['ok' => true, 'payment_id' => $paymentId]);
                } catch (Exception $ex) {
                    db()->rollBack();
                    jsonError($ex->getMessage(), 500);
                }
            } else { jsonError('Not found', 404); }
            break;

        case 'support-requests':
            requireFeature('support_requests');
            $SUPPORT_TIMES = ['14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'];
            // Helper: get booked slots in date range
            $getBooked = function(string $from, string $to): array {
                $stmt = db()->prepare("SELECT scheduled_date::text, scheduled_time::text FROM support_requests WHERE scheduled_date BETWEEN ? AND ? AND status != 'cancelled'");
                $stmt->execute([$from, $to]);
                $booked = [];
                foreach ($stmt->fetchAll() as $r) $booked[$r['scheduled_date'] . '_' . substr($r['scheduled_time'],0,5)] = true;
                return $booked;
            };

            if ($method === 'GET' && $sub === 'slots') {
                // GET /support-requests/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
                $from = $_GET['from'] ?? date('Y-m-d');
                $to   = $_GET['to']   ?? date('Y-m-d', strtotime('+7 days'));
                $booked = $getBooked($from, $to);
                $slots = [];
                $cur = new DateTime($from);
                $end = new DateTime($to);
                while ($cur <= $end) {
                    $dow = (int)$cur->format('N'); // 1=Mon,7=Sun
                    if ($dow <= 6) { // Mon-Sat
                        $d = $cur->format('Y-m-d');
                        foreach ($SUPPORT_TIMES as $t) {
                            if (!isset($booked[$d . '_' . $t])) $slots[] = ['date' => $d, 'time' => $t];
                        }
                    }
                    $cur->modify('+1 day');
                }
                jsonResponse($slots);

            } elseif ($method === 'GET') {
                $from = $_GET['from'] ?? date('Y-m-d', strtotime('monday this week'));
                $to   = $_GET['to']   ?? date('Y-m-d', strtotime('saturday this week'));
                $stmt = db()->prepare("
                    SELECT sr.id, sr.student_id, sr.status, sr.source, sr.assigned_to,
                           sr.notes, sr.topic, sr.cancelled_reason, sr.created_by, sr.created_at, sr.updated_at,
                           sr.scheduled_date::text AS scheduled_date,
                           TO_CHAR(sr.scheduled_time, 'HH24:MI') AS scheduled_time,
                           s.first_name || ' ' || s.last_name AS student_name, s.phone AS student_phone,
                           e.full_name AS assigned_to_name,
                           cb.name AS created_by_name
                    FROM support_requests sr
                    LEFT JOIN students s ON sr.student_id = s.id
                    LEFT JOIN employees e ON sr.assigned_to = e.id
                    LEFT JOIN users cb ON sr.created_by = cb.id
                    WHERE sr.scheduled_date BETWEEN ? AND ?
                    ORDER BY sr.scheduled_date, sr.scheduled_time
                ");
                $stmt->execute([$from, $to]);
                jsonResponse($stmt->fetchAll());

            } elseif ($method === 'POST') {
                $studentId = (int)($input['student_id'] ?? 0);
                $date = $input['scheduled_date'] ?? '';
                $time = $input['scheduled_time'] ?? '';
                if (!$studentId || !$date || !$time) { jsonError('student_id, scheduled_date and scheduled_time are required'); break; }
                if ($date < date('Y-m-d') || $date > date('Y-m-d', strtotime('+4 days'))) { jsonError('Date must be within the next 5 days'); break; }
                if (!in_array($time, $SUPPORT_TIMES)) { jsonError('Invalid time slot'); break; }
                // Check slot not taken
                $taken = db()->prepare("SELECT id FROM support_requests WHERE scheduled_date = ? AND scheduled_time = ? AND status != 'cancelled'");
                $taken->execute([$date, $time]);
                if ($taken->fetch()) { jsonError('This time slot is already booked'); break; }
                $createdBy = $GLOBALS['jwt_user']['id'] ?? null;
                $stmt = db()->prepare("INSERT INTO support_requests (student_id, scheduled_date, scheduled_time, source, created_by, notes, topic) VALUES (?,?,?,?,?,?,?)");
                $stmt->execute([$studentId, $date, $time, $input['source'] ?? 'manual', $createdBy, $input['notes'] ?? null, $input['topic'] ?? null]);
                jsonResponse(['id' => (int)db()->lastInsertId()]);

            } elseif ($method === 'PUT' && $id) {
                $action = $input['action'] ?? '';
                if ($action === 'confirm') {
                    $assignedTo = (int)($input['assigned_to'] ?? 0);
                    if (!$assignedTo) { jsonError('assigned_to is required'); break; }
                    db()->prepare("UPDATE support_requests SET status='confirmed', assigned_to=?, updated_at=NOW() WHERE id=?")->execute([$assignedTo, $id]);
                    // Notify student via Telegram
                    $row = db()->prepare("SELECT sr.student_id, sr.scheduled_date, sr.scheduled_time, e.full_name AS ta_name, e.teacher_id AS ta_teacher_id FROM support_requests sr LEFT JOIN employees e ON sr.assigned_to=e.id WHERE sr.id=?");
                    $row->execute([$id]); $row = $row->fetch();
                    if ($row) {
                        $dateStr = date('D, M j', strtotime($row['scheduled_date']));
                        $msg = "✅ Your support request has been <b>confirmed</b>!\n\n📅 {$dateStr} at " . substr($row['scheduled_time'],0,5) . "\n👤 Teacher: {$row['ta_name']}";
                        telegramNotifyStudent((int)$row['student_id'], $msg, 'custom');
                        // Also notify the TA via their teacher Telegram link
                        if ($row['ta_teacher_id']) {
                            $taLink = db()->prepare("SELECT chat_id FROM telegram_links WHERE entity_type='teacher' AND entity_id=? AND linked_at IS NOT NULL");
                            $taLink->execute([$row['ta_teacher_id']]); $taLink = $taLink->fetch();
                            if ($taLink && $taLink['chat_id']) {
                                $stName = db()->prepare("SELECT first_name||' '||last_name AS n FROM students WHERE id=?");
                                $stName->execute([$row['student_id']]); $stName = $stName->fetchColumn();
                                telegramSend((int)$taLink['chat_id'], "📋 New support session assigned to you!\n\n👤 Student: {$stName}\n📅 {$dateStr} at " . substr($row['scheduled_time'],0,5), 'custom');
                            }
                        }
                    }
                    jsonResponse(['ok' => true]);
                } elseif ($action === 'cancel') {
                    $reason = $input['reason'] ?? null;
                    db()->prepare("UPDATE support_requests SET status='cancelled', cancelled_reason=?, updated_at=NOW() WHERE id=?")->execute([$reason, $id]);
                    // Notify student
                    $row = db()->prepare("SELECT student_id, scheduled_date, scheduled_time FROM support_requests WHERE id=?");
                    $row->execute([$id]); $row = $row->fetch();
                    if ($row) {
                        $dateStr = date('D, M j', strtotime($row['scheduled_date']));
                        telegramNotifyStudent((int)$row['student_id'], "❌ Your support request on {$dateStr} at {$row['scheduled_time']} has been <b>cancelled</b>." . ($reason ? "\nReason: {$reason}" : ''), 'custom');
                    }
                    jsonResponse(['ok' => true]);
                } else {
                    jsonError('Invalid action');
                }

            } elseif ($method === 'DELETE' && $id) {
                db()->prepare("DELETE FROM support_requests WHERE id=?")->execute([$id]);
                jsonResponse(['ok' => true]);
            } else {
                jsonError('Method not allowed', 405);
            }
            break;

        default:
            jsonError('Not found', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
