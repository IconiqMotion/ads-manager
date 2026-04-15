# Deploying ads-mangment to AWS EC2

Target setup:

- **Compute:** single EC2 (Ubuntu 24.04), running Node.js backend + nginx
- **Process manager:** `pm2`
- **Database:** PostgreSQL 16 installed on the same EC2 host
- **Media storage:** `s3://iconiq-backups/ads/` (region `eu-north-1`)
- **Frontend:** built with Vite, static files served by nginx
- **HTTPS:** deferred — public IP only for now. Add Let's Encrypt via `certbot --nginx` once a domain points at the host.

---

## 1. Provision the EC2 host

**Instance:** `t3.small` or larger, 20 GB+ EBS, Ubuntu 24.04 LTS.

**Security group inbound rules:**

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22   | TCP      | your IP | SSH |
| 80   | TCP      | 0.0.0.0/0 | HTTP |
| 443  | TCP      | 0.0.0.0/0 | HTTPS (once certbot runs) |

**IAM instance profile:** attach a role that allows `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`, `s3:ListBucket` on `arn:aws:s3:::iconiq-backups` and `arn:aws:s3:::iconiq-backups/ads/*`. This removes the need for static AWS keys.

SSH in, then:

```bash
sudo apt-get update -y
git clone https://github.com/IconiqMotion/ads-manager.git /opt/ads-mangment
cd /opt/ads-mangment
bash scripts/deploy/provision.sh
```

`provision.sh` installs Node 22, nginx, Postgres, pm2; creates the `ads_dashboard` DB + `ads_user` role; and prints the generated DB password.

## 2. Configure secrets

```bash
cp /opt/ads-mangment/backend/.env.production.example /opt/ads-mangment/backend/.env
nano /opt/ads-mangment/backend/.env
```

Fill in, at minimum:

- `DATABASE_URL` — use the password `provision.sh` printed
- `JWT_SECRET` — `openssl rand -base64 48`
- `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`
- `CORS_ORIGIN` — `http://<EC2_PUBLIC_IP>` (or your future domain)
- `FIREBERRY_TOKEN`, `META_BUSINESS_ID`, `META_BUSINESS_TOKEN`
- `OPENAI_API_KEY` (only if you need AI features)

S3 values are already preset for `iconiq-backups` / `eu-north-1` / prefix `ads`.

`chmod 600 /opt/ads-mangment/backend/.env` after editing.

## 3. First deploy

```bash
bash /opt/ads-mangment/scripts/deploy/deploy.sh
```

This pulls latest `main`, installs deps, runs migrations + seeds, builds the frontend, syncs `dist/` to `/var/www/ads-mangment`, and starts pm2.

## 4. Wire up nginx

```bash
sudo cp /opt/ads-mangment/scripts/deploy/nginx.conf /etc/nginx/sites-available/ads-mangment
sudo ln -sf /etc/nginx/sites-available/ads-mangment /etc/nginx/sites-enabled/ads-mangment
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Persist pm2 across reboots

```bash
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# run the command pm2 prints, then:
pm2 save
```

## 6. Smoke test

```bash
curl -sS http://<EC2_PUBLIC_IP>/api/v1/health | jq
```

Browser: `http://<EC2_PUBLIC_IP>` → log in with the admin creds from the `.env`.

---

## Recurring deploys

On every push to `main`:

```bash
ssh ubuntu@<EC2_PUBLIC_IP> 'bash /opt/ads-mangment/scripts/deploy/deploy.sh'
```

Later this can be wired to a GitHub Actions workflow.

## Adding HTTPS (once you have a domain)

1. Point an A record at the EC2 public IP.
2. Update `server_name` in `/etc/nginx/sites-available/ads-mangment` (replace `_`).
3. Update `CORS_ORIGIN` in `backend/.env` to include `https://yourdomain`.
4. `sudo apt-get install -y certbot python3-certbot-nginx`
5. `sudo certbot --nginx -d ads.yourcompany.com`
6. `pm2 reload ads-mangment-backend --update-env`

## Logs

- Backend (pm2): `/var/log/ads-mangment/backend.{out,err}.log` — also `pm2 logs`
- nginx: `/var/log/nginx/{access,error}.log`

## Known followups (not blockers for first deploy)

- [backend/services/logo-removal.service.js](backend/services/logo-removal.service.js) still writes to local `data/media/`. It works on a single EC2 (EBS-backed), but processed outputs aren't uploaded to S3. Route its final outputs through `storage.service.js` when you need multi-host or immutable artifacts.
- No CI/CD — `deploy.sh` is manual.
- Single instance, single-region. `node-cron` jobs run in-process; scaling horizontally would duplicate them.
