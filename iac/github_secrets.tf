resource "null_resource" "github_secrets" {
  depends_on = [aws_instance.app, aws_instance.ollama]

  triggers = {
    app_ip    = aws_instance.app.public_ip
    ollama_ip = aws_instance.ollama.private_ip
  }

  provisioner "local-exec" {
    command = <<-EOT
      gh secret set EC2_IP    --repo ${var.github_repo} --body "${aws_instance.app.public_ip}"
      gh secret set OLLAMA_IP --repo ${var.github_repo} --body "${aws_instance.ollama.private_ip}"
    EOT
  }
}
