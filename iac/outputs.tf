output "app_public_ip" {
  description = "Public IP of the app EC2 — use as EC2_IP in GitHub secrets"
  value       = aws_instance.app.public_ip
}

output "app_public_dns" {
  description = "Public DNS name of the app EC2"
  value       = aws_instance.app.public_dns
}

output "ollama_private_ip" {
  description = "Private IP of the Ollama EC2 — use as OLLAMA_IP in GitHub secrets and OLLAMA_BASE_URL in .env"
  value       = aws_instance.ollama.private_ip
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}
