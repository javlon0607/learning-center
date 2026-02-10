<?php
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if ($uri === false) $uri = '/';
if (strpos($uri, '/api') === 0) {
    $_SERVER['REQUEST_URI'] = '/api/index.php' . substr($uri, 4);
    include __DIR__ . '/api/index.php';
    return true;
}
return false;
