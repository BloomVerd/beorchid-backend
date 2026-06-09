#!/bin/bash
set -euo pipefail
exec > /var/log/user-data.log 2>&1

# ── 1. Install Docker + aws-cli ───────────────────────────────────────────
dnf update -y
dnf install -y docker aws-cli
systemctl enable --now docker
usermod -aG docker ec2-user

# ── 2. Install Docker Compose plugin ─────────────────────────────────────
mkdir -p /usr/libexec/docker/cli-plugins
curl -fsSL \
  "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# ── 3. Create directories ─────────────────────────────────────────────────
mkdir -p /mnt/postgres-data /mnt/redis-data /home/ec2-user/beorchid-backend
cd /home/ec2-user/beorchid-backend

# ── 4. Write docker-compose.yml (embedded by Terraform at apply time) ─────
cat > docker-compose.yml << 'COMPOSE'
${compose_content}
COMPOSE

# ── 5. Fetch .env from SSM (instance role grants read access) ─────────────
aws ssm get-parameter \
  --region ${region} \
  --name /${project_name}/env-file \
  --with-decryption \
  --query Parameter.Value \
  --output text > .env

# ── 6. Fix ownership and start containers ─────────────────────────────────
chown -R ec2-user:ec2-user \
  /home/ec2-user/beorchid-backend \
  /mnt/postgres-data \
  /mnt/redis-data

COMPOSE_PROJECT_NAME=beorchid-backend docker compose up -d

echo "======================================="
echo "  App deployment complete"
echo "  Time: $(date)"
echo "======================================="
