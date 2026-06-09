import json
import os
import boto3
from datetime import datetime, timezone
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
TABLE    = os.environ.get('DYNAMO_TABLE', 'farm_telemetry')
TTL_DAYS = int(os.environ.get('TTL_DAYS', '90'))

def lambda_handler(event, context):
    farm_id   = event.get('farm_id')
    device_id = event.get('device_id')
    metrics   = event.get('metrics', {})
    ts        = event.get('ts')

    if not farm_id or not device_id or not metrics:
        print(f"Invalid payload: {json.dumps(event)}")
        return { 'statusCode': 400 }

    timestamp = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    ttl       = int(datetime.now(tz=timezone.utc).timestamp()) + (TTL_DAYS * 24 * 60 * 60)

    item = {
        'farm_id':   farm_id,
        'timestamp': timestamp,
        'device_id': device_id,
        'ttl':       ttl,
        **{ k: Decimal(str(v)) for k, v in metrics.items() },
    }

    try:
        table = dynamodb.Table(TABLE)
        table.put_item(Item=item)
        print(f"Written item for farm={farm_id} device={device_id} ts={timestamp}")
        return { 'statusCode': 200 }

    except Exception as e:
        print(f"DynamoDB write error: {e}")
        raise
