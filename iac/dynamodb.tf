resource "aws_dynamodb_table" "farm_telemetry" {
  name         = "farm_telemetry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "farm_id"
  range_key    = "timestamp"

  attribute {
    name = "farm_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name    = "farm_telemetry"
    Project = var.project_name
  }
}
