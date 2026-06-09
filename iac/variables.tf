variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix applied to all resource names and tags"
  type        = string
  default     = "beorchid"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR for the public subnet (app EC2)"
  type        = string
  default     = "10.0.1.0/24"
}

variable "private_subnet_cidr" {
  description = "CIDR for the private subnet (ollama EC2)"
  type        = string
  default     = "10.0.2.0/24"
}

variable "availability_zone" {
  description = "AZ for both subnets"
  type        = string
  default     = "us-east-1a"
}

variable "public_key" {
  description = "SSH public key material to install on EC2 instances (contents of id_rsa.pub)"
  type        = string
  sensitive   = true
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH into the app instance on port 22"
  type        = string
  default     = "0.0.0.0/0"
}

variable "app_instance_type" {
  description = "EC2 instance type for the app server"
  type        = string
  default     = "t3.medium"
}

variable "ollama_instance_type" {
  description = "EC2 instance type for Ollama (g4dn.xlarge has T4 GPU needed for qwen2.5:7b)"
  type        = string
  default     = "g4dn.xlarge"
}

variable "env_file_content" {
  description = "Full contents of the .env file — stored in SSM and fetched by EC2 instances on boot"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository in owner/repo format — used to update EC2_IP and OLLAMA_IP secrets after apply"
  type        = string
}
