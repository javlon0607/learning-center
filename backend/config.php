<?php
// Database Configuration (from Docker environment)
define('DB_HOST', getenv('DB_HOST') ?: 'postgres');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'learning_center_db');
define('DB_USER', getenv('DB_USER') ?: 'learning_center_user');
define('DB_PASS', getenv('DB_PASS') ?: 'postgres123');

// Session Configuration
ini_set('session.gc_maxlifetime', 1800);
session_set_cookie_params(1800);

// Error Reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// CORS Configuration
header('Access-Control-Allow-Origin: *');
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
    // Tables already created manually, nothing to do
    return;
}

// Session timeout (minutes)
define('SESSION_TIMEOUT_MINUTES', (int)(getenv('SESSION_TIMEOUT') ?: 30));

if (!defined('IS_API')) {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    define('IS_API', strpos($uri, '/api') !== false || !empty($_SERVER['HTTP_X_REQUESTED_WITH']));
}

// Check session timeout
function checkSessionTimeout() {
    if (!isset($_SESSION['user'])) return false;
    $last = $_SESSION['last_activity'] ?? 0;
    if (time() - $last > SESSION_TIMEOUT_MINUTES * 60) {
        unset($_SESSION['user'], $_SESSION['user_id'], $_SESSION['last_activity']);
        return false;
    }
    $_SESSION['last_activity'] = time();
    return true;
}

// Authentication helper
function auth() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    if (!checkSessionTimeout()) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized', 'code' => 'SESSION_EXPIRED']);
        exit;
    }

    // Check if user is active
    $userId = $_SESSION['user']['id'] ?? $_SESSION['user_id'] ?? null;
    if ($userId) {
        $db = getDB();
        $stmt = $db->prepare("SELECT is_active FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user || ($user['is_active'] === false || $user['is_active'] === 'f' || $user['is_active'] === 0)) {
            unset($_SESSION['user'], $_SESSION['user_id'], $_SESSION['last_activity']);
            http_response_code(403);
            echo json_encode(['error' => 'Account deactivated']);
            exit;
        }
    }
}

// Check if user has required role
function requireRole($allowed) {
    auth();
    $roleStr = $_SESSION['user']['role'] ?? '';
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
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    $user_id = $_SESSION['user_id'] ?? null;
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
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    $user_id = $_SESSION['user_id'] ?? null;
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
