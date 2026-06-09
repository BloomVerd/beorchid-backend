resource "aws_key_pair" "main" {
  key_name   = "${var.project_name}-keypair"
  public_key = var.public_key

  tags = {
    Name    = "${var.project_name}-keypair"
    Project = var.project_name
  }
}
