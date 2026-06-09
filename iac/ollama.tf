resource "aws_instance" "ollama" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ollama_instance_type
  subnet_id                   = aws_subnet.private.id
  vpc_security_group_ids      = [aws_security_group.ollama.id]
  key_name                    = aws_key_pair.main.key_name
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = false

  root_block_device {
    # CUDA drivers ~2GB + qwen2.5:7b weights ~8GB + Docker images + headroom
    volume_size           = 100
    volume_type           = "gp3"
    delete_on_termination = true
  }

  user_data = base64encode(templatefile("${path.module}/templates/ollama_userdata.sh", {
    region          = var.aws_region
    project_name    = var.project_name
    compose_content = file("${path.module}/../docker-compose.ollama.yml")
  }))

  depends_on = [aws_ssm_parameter.env_file, aws_nat_gateway.main]

  tags = {
    Name    = "${var.project_name}-ollama"
    Project = var.project_name
  }
}
