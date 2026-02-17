#!/bin/sh
echo "[entrypoint] Running database migrations..."
php /var/www/html/migrate.php
echo "[entrypoint] Starting php-fpm..."
exec php-fpm
