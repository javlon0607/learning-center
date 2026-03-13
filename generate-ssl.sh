#!/bin/bash
# Generate a self-signed SSL certificate for Telegram webhook
# Usage: bash generate-ssl.sh <your-server-ip>
# Example: bash generate-ssl.sh 109.199.99.226

IP="${1:-109.199.99.226}"

echo "Generating self-signed SSL certificate for IP: $IP"

openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout server.key \
  -x509 -days 3650 \
  -out server.crt \
  -subj "/CN=${IP}"

# Copy cert for Telegram webhook registration (PHP backend reads this file)
cp server.crt backend/telegram.crt

echo ""
echo "Done! Files created:"
echo "  server.crt           — SSL certificate"
echo "  server.key           — SSL private key"
echo "  backend/telegram.crt — Certificate for Telegram webhook registration"
echo ""
echo "Next steps:"
echo "  1. Configure your native nginx to use server.crt and server.key for HTTPS"
echo "  2. Reload nginx: sudo nginx -s reload"
echo "  3. Go to Telegram → Bot Setup → enter https://${IP}/api/telegram-webhook → Register Webhook"
