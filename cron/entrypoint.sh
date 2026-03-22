#!/bin/sh
set -e

# Write crontab with CRON_SECRET substituted
sed "s|\${CRON_SECRET}|${CRON_SECRET}|g" /etc/cron/crontab.template > /etc/crontabs/root
chmod 600 /etc/crontabs/root

echo "Cron jobs installed:"
cat /etc/crontabs/root

# Run crond in foreground
exec crond -f -l 2
