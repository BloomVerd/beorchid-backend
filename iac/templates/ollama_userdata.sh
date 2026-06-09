#!/bin/bash
set -euo pipefail
exec > /var/log/user-data.log 2>&1

# ── 1. Install base packages ──────────────────────────────────────────────
dnf update -y
dnf install -y docker aws-cli kernel-devel kernel-headers gcc make dkms

# ── 2. NVIDIA CUDA drivers ────────────────────────────────────────────────
# AL2023 is RHEL9-compatible; NVIDIA does not publish an amzn2023 repo.
# latest-dkms builds the kernel module against the running kernel at install
# time, avoiding pre-compiled version mismatches.
dnf config-manager --add-repo \
  https://developer.download.nvidia.com/compute/cuda/repos/rhel9/x86_64/cuda-rhel9.repo
dnf clean expire-cache
dnf module install -y nvidia-driver:latest-dkms
dnf install -y cuda-drivers

# ── 3. nvidia-container-toolkit ──────────────────────────────────────────
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL \
  https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
  | tee /etc/yum.repos.d/nvidia-container-toolkit.repo

# ── 4. Docker + Compose ───────────────────────────────────────────────────
systemctl enable --now docker
usermod -aG docker ec2-user

mkdir -p /usr/libexec/docker/cli-plugins
curl -fsSL \
  "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# ── 5. Enable NVIDIA runtime for Docker ──────────────────────────────────
dnf install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker --set-as-default
systemctl restart docker

# ── 6. Create directories ─────────────────────────────────────────────────
mkdir -p /mnt/ollama-models /home/ec2-user/ollama
cd /home/ec2-user/ollama

# ── 7. Write docker-compose.yml (embedded by Terraform at apply time) ─────
cat > docker-compose.yml << 'COMPOSE'
${compose_content}
COMPOSE

# ── 8. Fetch .env from SSM ────────────────────────────────────────────────
aws ssm get-parameter \
  --region ${region} \
  --name /${project_name}/env-file \
  --with-decryption \
  --query Parameter.Value \
  --output text > .env

# ── 9. Fix ownership and start containers ─────────────────────────────────
chown -R ec2-user:ec2-user /home/ec2-user/ollama /mnt/ollama-models
COMPOSE_PROJECT_NAME=ollama docker compose up -d

echo "======================================="
echo "  Ollama deployment complete"
echo "  Time: $(date)"
echo "======================================="
