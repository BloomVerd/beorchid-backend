resource "aws_ssm_parameter" "env_file" {
  name        = "/${var.project_name}/env-file"
  description = "Full .env file content for beorchid-backend and ollama deployments"
  type        = "SecureString"
  value       = var.env_file_content

  tags = { Project = var.project_name }
}
