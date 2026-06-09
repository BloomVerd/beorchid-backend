resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg"
  description = "App EC2: allow SSH from operator, port 4000 from internet, all egress"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  ingress {
    description = "App API"
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-app-sg"
    Project = var.project_name
  }
}

resource "aws_security_group" "ollama" {
  name        = "${var.project_name}-ollama-sg"
  description = "Ollama EC2: allow port 11434 and SSH from app EC2 only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Ollama API from app EC2 only"
    from_port       = 11434
    to_port         = 11434
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  ingress {
    description     = "SSH from app EC2 (jump host for CD pipeline)"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-ollama-sg"
    Project = var.project_name
  }
}
