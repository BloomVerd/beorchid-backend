import OpenAI from 'openai';

export const LLM_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_farm_health',
      description:
        'Retrieve the latest farm health report including overall score, soil health, crop health, weather stress, disease risk, disease alerts, health alerts, and sensor history.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_predictions',
      description: 'Retrieve recent disease and yield predictions for the farm.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max number of predictions to return (default 10)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_iot_devices',
      description:
        'List all IoT devices (soil sensors, weather stations, cameras, etc.) registered on the farm and their active status.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_farm_details',
      description:
        'Get farm metadata: name, crop type, variety, farm size, soil type, farm type, and coordinates.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trigger_iot_device',
      description:
        'Send a command to an IoT device on the farm (e.g., start irrigation, capture an image). Returns the tool call record including its ID for tracking.',
      parameters: {
        type: 'object',
        properties: {
          device_id: {
            type: 'string',
            description: 'The UUID of the IotDevice to command',
          },
          command_type: {
            type: 'string',
            enum: [
              'IRRIGATE',
              'STOP_IRRIGATION',
              'CAPTURE_IMAGE',
              'ACTIVATE_SENSOR',
              'DEACTIVATE_SENSOR',
            ],
            description: 'The command to send to the device',
          },
          parameters: {
            type: 'object',
            description:
              'Optional command parameters, e.g. { "duration_minutes": 30 }',
          },
        },
        required: ['device_id', 'command_type'],
      },
    },
  },
];

export interface ChatSseEvent {
  type: 'token' | 'tool_use' | 'done' | 'error';
  chatId: string;
  delta?: string;
  toolName?: string;
  messageId?: string;
  message?: string;
}
