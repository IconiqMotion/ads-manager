#!/usr/bin/env bash
# One-shot provisioning for a fresh Ubuntu 24.04 EC2 host.
# Run as a sudo-capable user:   bash provision.sh
set -euo pipefail

APP_DIR=/opt/ads-mangment
APP_USER=${APP_USER:-ubuntu}
DB_NAME=ads_dashboard
DB_USER=ads_user

echo "==> apt update + base packages"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg git build-essential nginx postgresql postgresql-contrib ufw

echo "==> Node.js 22 LTS"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> pm2"
sudo npm install -g pm2

echo "==> Postgres role + db"
if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASSWORD=$(openssl rand -base64 24)
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';"
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  echo
  echo "Generated Postgres password for ${DB_USER}: ${DB_PASSWORD}"
  echo "Put this into DATABASE_URL in ${APP_DIR}/backend/.env now."
  echo
else
  echo "Postgres role ${DB_USER} already exists — skipping creation."
fi

echo "==> App directory"
sudo mkdir -p "${APP_DIR}" /var/www/ads-mangment /var/log/ads-mangment
sudo chown -R "${APP_USER}":"${APP_USER}" "${APP_DIR}" /var/www/ads-mangment /var/log/ads-mangment

echo "==> Firewall"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo "==> nginx site (placeholder — replace after first deploy)"
sudo rm -f /etc/nginx/sites-enabled/default
echo
echo "Next steps:"
echo "  1. git clone <repo> ${APP_DIR}"
echo "  2. cp ${APP_DIR}/backend/.env.production.example ${APP_DIR}/backend/.env  # fill in values"
echo "  3. bash ${APP_DIR}/scripts/deploy/deploy.sh"
echo "  4. sudo cp ${APP_DIR}/scripts/deploy/nginx.conf /etc/nginx/sites-available/ads-mangment"
echo "     sudo ln -sf /etc/nginx/sites-available/ads-mangment /etc/nginx/sites-enabled/ads-mangment"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo "  5. pm2 start ${APP_DIR}/scripts/deploy/ecosystem.config.cjs"
echo "     pm2 save && pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}"
