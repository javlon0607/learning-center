<?php
// Database Configuration (from Docker environment)
define('DB_HOST', getenv('DB_HOST') ?: 'postgres');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'learning_center_db');
define('DB_USER', getenv('DB_USER') ?: 'learning_center_user');
define('DB_PASS', getenv('DB_PASS') ?: 'postgres123');

// JWT Configuration
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'CHANGE_ME_TO_A_RANDOM_64_CHARACTER_STRING');
define('JWT_ACCESS_TTL', (int)(getenv('JWT_ACCESS_TTL') ?: 1800));
define('JWT_REFRESH_TTL', (int)(getenv('JWT_REFRESH_TTL') ?: 604800));

// Error Reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// CORS Configuration
$origin = $_SERVER['HTTP_ORIGIN'] ?? 'http://localhost';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Database Connection
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "pgsql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec("SET timezone = 'Asia/Tashkent'");
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

// Alias for backward compatibility
function db() {
    return getDB();
}

// Initialize database schema
function initDB() {
    return;
}

// ── JWT helpers ──────────────────────────────────────────────────────────

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwtEncode(array $payload): string {
    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload = base64url_encode(json_encode($payload));
    $signature = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$signature";
}

function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $signature] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $signature)) return null;
    $data = json_decode(base64url_decode($payload), true);
    if (!$data || !isset($data['exp']) || $data['exp'] < time()) return null;
    return $data;
}

// ── Token pair generation ────────────────────────────────────────────────

function generateTokenPair(array $user): array {
    $now = time();

    // Access token (JWT)
    $accessPayload = [
        'sub'  => (int)$user['id'],
        'name' => $user['name'],
        'role' => $user['role'],
        'iat'  => $now,
        'exp'  => $now + JWT_ACCESS_TTL,
    ];
    $accessToken = jwtEncode($accessPayload);

    // Refresh token (random hex, store SHA-256 hash in DB)
    $refreshToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $refreshToken);

    $db = getDB();
    $stmt = $db->prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, to_timestamp(?))");
    $stmt->execute([(int)$user['id'], $tokenHash, $now + JWT_REFRESH_TTL]);

    return [
        'access_token'  => $accessToken,
        'refresh_token' => $refreshToken,
        'expires_in'    => JWT_ACCESS_TTL,
    ];
}

// ── Refresh-token cookie helpers ─────────────────────────────────────────

function setRefreshTokenCookie(string $token): void {
    setcookie('refresh_token', $token, [
        'expires'  => time() + JWT_REFRESH_TTL,
        'path'     => '/api',
        'httponly'  => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
}

function clearRefreshTokenCookie(): void {
    setcookie('refresh_token', '', [
        'expires'  => 1,
        'path'     => '/api',
        'httponly'  => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
}

// ── Authentication (JWT-based) ───────────────────────────────────────────

function auth() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') !== 0) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $token = substr($header, 7);
    $payload = jwtDecode($token);
    if (!$payload) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    // Check if user is still active
    $db = getDB();
    $stmt = $db->prepare("SELECT is_active FROM users WHERE id = ?");
    $stmt->execute([$payload['sub']]);
    $user = $stmt->fetch();

    if (!$user || ($user['is_active'] === false || $user['is_active'] === 'f' || $user['is_active'] === 0)) {
        http_response_code(403);
        echo json_encode(['error' => 'Account deactivated']);
        exit;
    }

    $GLOBALS['jwt_user'] = [
        'id'   => (int)$payload['sub'],
        'name' => $payload['name'],
        'role' => $payload['role'],
    ];
}

// Check if user has required role
function requireRole($allowed) {
    auth();
    $roleStr = $GLOBALS['jwt_user']['role'] ?? '';
    $userRoles = array_map('trim', explode(',', $roleStr));
    $userRoles = array_filter($userRoles);
    if (empty($userRoles)) $userRoles = ['user'];
    $allowed = is_array($allowed) ? $allowed : [$allowed];
    if (count(array_intersect($userRoles, $allowed)) > 0) {
        return true;
    }
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

// Activity logging
function activityLog($action, $entity = null, $entity_id = null, $details = null) {
    $user_id = $GLOBALS['jwt_user']['id'] ?? null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    try {
        $db = getDB();
        $stmt = $db->prepare("
            INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        ");

        $stmt->execute([
            $user_id,
            $action,
            $entity,
            $entity_id,
            $ip,
            $details
        ]);
    } catch (PDOException $e) {
        error_log("Activity log failed: " . $e->getMessage());
    }
}

// Audit logging with before/after values
function auditLog($action, $entity_type, $entity_id, $old_values = null, $new_values = null) {
    $user_id = $GLOBALS['jwt_user']['id'] ?? null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    try {
        $db = getDB();
        $stmt = $db->prepare("
            INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ");

        $stmt->execute([
            $user_id,
            $action,
            $entity_type,
            $entity_id,
            $old_values ? json_encode($old_values) : null,
            $new_values ? json_encode($new_values) : null,
            $ip
        ]);
    } catch (PDOException $e) {
        error_log("Audit log failed: " . $e->getMessage());
    }
}

// ── Notification helpers ─────────────────────────────────────────────────

function isNotificationEnabled(string $type): bool
{
    $settingMap = [
        'payment_reminder' => 'notification_payment_reminders',
        'lead_followup_overdue' => 'notification_new_leads',
        'student_enrolled' => 'notification_enrollment',
        'student_removed' => 'notification_enrollment',
        'schedule_change' => 'notification_schedule',
    ];
    $settingKey = $settingMap[$type] ?? null;
    if (!$settingKey) return true; // unknown types default to enabled
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$settingKey]);
        $val = $stmt->fetchColumn();
        return $val !== 'false'; // enabled by default unless explicitly 'false'
    } catch (PDOException $e) {
        return true; // if settings table missing, default to enabled
    }
}

function createNotification(int $userId, string $type, string $title, string $message = '', string $link = ''): void
{
    try {
        if (!isNotificationEnabled($type)) return;
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $type, $title, $message, $link]);
    } catch (PDOException $e) {
        error_log("Notification insert failed: " . $e->getMessage());
    }
}

function getTeacherUserId(int $groupId): ?int
{
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT u.id FROM users u JOIN groups g ON u.teacher_id = g.teacher_id WHERE g.id = ? AND u.is_active = true LIMIT 1");
        $stmt->execute([$groupId]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    } catch (PDOException $e) {
        error_log("getTeacherUserId failed: " . $e->getMessage());
        return null;
    }
}
