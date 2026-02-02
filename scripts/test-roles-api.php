<?php
/**
 * API role test: run as admin and as teacher, verify allowed/forbidden endpoints.
 * Run from project root: php scripts/test-roles-api.php
 * Requires: PHP CLI, project config (DB), API on http://localhost:8000
 */

$base = 'http://localhost:8000/api';
$passed = 0;
$failed = 0;

function request($method, $url, $data = null, $cookie = null) {
    $opts = [
        'http' => [
            'method' => $method,
            'header' => "Content-Type: application/json\r\n" . ($cookie ? "Cookie: $cookie\r\n" : ''),
            'ignore_errors' => true,
            'follow_location' => 0,
        ]
    ];
    if ($data !== null && in_array($method, ['POST', 'PUT'])) {
        $opts['http']['content'] = json_encode($data);
    }
    $ctx = stream_context_create($opts);
    $response = @file_get_contents($url, false, $ctx);
    $code = 200;
    $headers = isset($http_response_header) && is_array($http_response_header) ? $http_response_header : [];
    foreach ($headers as $h) {
        if (stripos($h, 'HTTP/') === 0) {
            preg_match('/ (\d+)/', $h, $m);
            $code = (int)($m[1] ?? 200);
            break;
        }
    }
    return ['code' => $code, 'body' => $response, 'headers' => $headers];
}

function login($username, $password) {
    global $base;
    $r = request('POST', "$base/login", ['username' => $username, 'password' => $password]);
    if ($r['code'] !== 200) return null;
    $parsed = json_decode($r['body'], true);
    if (!isset($parsed['user'])) return null;
    $cookie = '';
    foreach ($r['headers'] as $h) {
        if (stripos($h, 'Set-Cookie:') === 0) {
            $cookie = trim(substr($h, 11));
            $cookie = strpos($cookie, ';') !== false ? substr($cookie, 0, strpos($cookie, ';')) : $cookie;
            break;
        }
    }
    return $cookie;
}

function test($name, $condition, $actualCode = null) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  [PASS] $name\n";
    } else {
        $failed++;
        echo "  [FAIL] $name" . ($actualCode !== null ? " (got $actualCode)" : "") . "\n";
    }
}

echo "=== Learning Center API – Role tests ===\n\n";

// --- Admin ---
echo "1. Login as admin (admin / password)\n";
$adminCookie = login('admin', 'password');
test('Admin login returns session', $adminCookie !== null);

if ($adminCookie) {
    echo "\n2. Admin – allowed endpoints (expect 200)\n";
    $get = function ($path) use ($base, $adminCookie) {
        return request('GET', "$base$path", null, $adminCookie);
    };
    $r = null;
    $r = $get('/me'); test('GET /me', $r['code'] === 200, $r['code']);
    $r = $get('/students'); test('GET /students', $r['code'] === 200, $r['code']);
    $r = $get('/teachers'); test('GET /teachers', $r['code'] === 200, $r['code']);
    $r = $get('/groups'); test('GET /groups', $r['code'] === 200, $r['code']);
    $r = $get('/leads'); test('GET /leads', $r['code'] === 200, $r['code']);
    $r = $get('/payments'); test('GET /payments', $r['code'] === 200, $r['code']);
    $r = $get('/expenses'); test('GET /expenses', $r['code'] === 200, $r['code']);
    $r = $get('/salary-slips'); test('GET /salary-slips', $r['code'] === 200, $r['code']);
    $r = $get('/dashboard/stats'); test('GET /dashboard/stats', $r['code'] === 200, $r['code']);
    $r = request('GET', "$base/reports/payments?from=2025-01-01&to=2025-12-31", null, $adminCookie); test('GET /reports/payments (with from,to)', $r['code'] === 200, $r['code']);
    $r = $get('/audit-log'); test('GET /audit-log', $r['code'] === 200, $r['code']);
    $r = $get('/users'); test('GET /users', $r['code'] === 200, $r['code']);
    $r = $get('/settings'); test('GET /settings', $r['code'] === 200, $r['code']);
}

// --- Teacher ---
echo "\n3. Login as teacher (teacher / password)\n";
$teacherCookie = login('teacher', 'password');
test('Teacher login returns session', $teacherCookie !== null);

if ($teacherCookie) {
    echo "\n4. Teacher – allowed endpoints (expect 200)\n";
    $get = function ($path) use ($base, $teacherCookie) {
        return request('GET', "$base$path", null, $teacherCookie);
    };
    test('GET /me', $get('/me')['code'] === 200);
    test('GET /students', $get('/students')['code'] === 200);
    test('GET /groups', $get('/groups')['code'] === 200);
    $r = request('GET', "$base/attendance?group_id=1&date=" . date('Y-m-d'), null, $teacherCookie); test('GET /attendance (with group_id, date)', $r['code'] !== 404, $r['code']); // 200 or 400 if no group
    $r = $get('/dashboard/stats'); test('GET /dashboard/stats', $r['code'] === 200, $r['code']);

    echo "\n5. Teacher – forbidden endpoints (expect 403)\n";
    test('GET /teachers → 403', $get('/teachers')['code'] === 403);
    test('GET /leads → 403', $get('/leads')['code'] === 403);
    test('GET /payments → 403', $get('/payments')['code'] === 403);
    test('GET /expenses → 403', $get('/expenses')['code'] === 403);
    test('GET /salary-slips → 403', $get('/salary-slips')['code'] === 403);
    test('GET /reports/payments → 403', request('GET', "$base/reports/payments?from=2025-01-01&to=2025-12-31", null, $teacherCookie)['code'] === 403);
    test('GET /audit-log → 403', $get('/audit-log')['code'] === 403);
    test('GET /users → 403', $get('/users')['code'] === 403);
    test('GET /settings → 403', $get('/settings')['code'] === 403);
}

echo "\n=== Result: $passed passed, $failed failed ===\n";
exit($failed > 0 ? 1 : 0);
