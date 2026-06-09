resource "aws_iot_topic_rule" "device_telemetry" {
  name        = "DeviceTelemetryIngestion"
  description = "Routes device telemetry from farms/+/+/telemetry to iot-dynamodb-writer Lambda"
  enabled     = true
  sql         = "SELECT * FROM 'farms/+/+/telemetry'"
  sql_version = "2016-03-23"

  lambda {
    function_arn = aws_lambda_function.iot_writer.arn
  }

  tags = { Project = var.project_name }
}
