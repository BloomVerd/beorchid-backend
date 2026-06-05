import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { IotCommandType } from '../farm/entities/iot-tool-call.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { FarmService } from '../farm/farm.service';
import { ChatPubSubService } from './chat-pubsub.service';
import { LLM_TOOLS } from './claude.tools';
import { createLlmClient, getLlmModel } from 'src/common/config/llm.config';

type ChatMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;

@Injectable()
export class ClaudeService {
  private readonly llm: OpenAI;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly pubSub: ChatPubSubService,
    private readonly farmService: FarmService,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
    @InjectRepository(IotDevice)
    private readonly iotDeviceRepo: Repository<IotDevice>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
  ) {
    this.llm = createLlmClient(this.configService);
    this.model = getLlmModel(this.configService);
  }

  async streamAndProcess(
    chatId: string,
    farmId: string,
    messages: ChatMessageParam[],
  ): Promise<string> {
    const currentMessages: ChatMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt(farmId) },
      ...messages,
    ];

    let assistantText = '';

    while (true) {
      const stream = await this.llm.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: currentMessages,
        tools: LLM_TOOLS,
        stream: true,
      });

      assistantText = '';
      const toolCalls: Record<
        number,
        { id: string; name: string; arguments: string }
      > = {};
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta?.content) {
          assistantText += delta.content;
          await this.pubSub.publish(chatId, {
            type: 'token',
            chatId,
            delta: delta.content,
          });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: '', name: '', arguments: '' };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) {
              toolCalls[idx].name = tc.function.name;
              await this.pubSub.publish(chatId, {
                type: 'tool_use',
                chatId,
                toolName: tc.function.name,
              });
            }
            if (tc.function?.arguments) {
              toolCalls[idx].arguments += tc.function.arguments;
            }
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      const collectedToolCalls = Object.values(toolCalls);

      if (finishReason !== 'tool_calls' || collectedToolCalls.length === 0) {
        return assistantText;
      }

      currentMessages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: collectedToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      const toolResults = await Promise.all(
        collectedToolCalls.map(async (tc) => {
          let input: Record<string, unknown> = {};
          try {
            input = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            input = {};
          }
          const result = await this.executeTool(tc.name, input, farmId);
          return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        }),
      );

      currentMessages.push(...toolResults);
    }
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    farmId: string,
  ): Promise<unknown> {
    switch (name) {
      case 'get_farm_health':
        return this.toolGetFarmHealth(farmId);
      case 'get_predictions':
        return this.toolGetPredictions(
          farmId,
          (input as { limit?: number }).limit,
        );
      case 'get_iot_devices':
        return this.toolGetIotDevices(farmId);
      case 'get_farm_details':
        return this.toolGetFarmDetails(farmId);
      case 'trigger_iot_device': {
        const args = input as {
          device_id: string;
          command_type: string;
          parameters?: Record<string, unknown>;
        };
        return this.farmService.triggerIotDevice(null, farmId, args.device_id, {
          command_type: args.command_type as IotCommandType,
          parameters: args.parameters,
        });
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private async toolGetFarmHealth(farmId: string) {
    const health = await this.farmHealthRepo.findOne({
      where: { farm: { id: farmId } },
      relations: [
        'crop_field_health',
        'disease_alerts',
        'health_alerts',
        'sensor_history',
        'yield_comparisons',
      ],
      order: { computed_at: 'DESC' },
    });

    if (!health) return { error: 'No health data found for this farm' };

    return {
      overall_score: health.overall_score,
      soil_health: health.soil_health,
      crop_health: health.crop_health,
      weather_stress: health.weather_stress,
      disease_risk: health.disease_risk,
      computed_at: health.computed_at,
      crop_field_health: health.crop_field_health?.map((cfh) => ({
        id: cfh.id,
        field_name: cfh.field_name,
        crop_type: cfh.crop_type,
        health_percent: cfh.health_percent,
        ndvi: cfh.ndvi,
        disease_probability: cfh.disease_probability,
        disease_type: cfh.disease_type,
        growth_stage: cfh.growth_stage,
        expected_harvest: cfh.expected_harvest,
      })),
      disease_alerts: health.disease_alerts?.map((da) => ({
        id: da.id,
        disease_name: da.disease_name,
        probability: da.probability,
        spread: da.spread,
        treatment: da.treatment,
        infected_leaves: da.infected_leaves,
        first_detected: da.first_detected,
      })),
      health_alerts: health.health_alerts?.map((ha) => ({
        id: ha.id,
        severity: ha.severity,
        title: ha.title,
        description: ha.description,
        action: ha.action,
        estimated_impact: ha.estimated_impact,
      })),
      sensor_history: health.sensor_history?.slice(0, 10).map((sp) => ({
        date: sp.date,
        temperature: sp.temperature,
        moisture: sp.moisture,
        nitrogen: sp.nitrogen,
        phosphorus: sp.phosphorus,
        potassium: sp.potassium,
      })),
    };
  }

  private async toolGetPredictions(farmId: string, limit?: number) {
    const predictions = await this.predictionRepo.find({
      where: { farm: { id: farmId } },
      order: { createdAt: 'DESC' },
      take: limit ?? 10,
    });

    return predictions.map((p) => ({
      id: p.id,
      prediction_type: p.prediction_type,
      risk_level: p.risk_level,
      lat: p.lat,
      lon: p.lon,
      createdAt: p.createdAt,
    }));
  }

  private async toolGetIotDevices(farmId: string) {
    const devices = await this.iotDeviceRepo.find({
      where: { farm: { id: farmId } },
    });

    return devices.map((d) => ({
      id: d.id,
      device_id: d.device_id,
      label: d.label,
      device_type: d.device_type,
      is_active: d.is_active,
      registered_at: d.registered_at,
    }));
  }

  private async toolGetFarmDetails(farmId: string) {
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) return { error: 'Farm not found' };

    return {
      id: farm.id,
      name: farm.name,
      crop_type: farm.crop_type,
      variety: farm.variety,
      farm_size: farm.farm_size,
      size_unit: farm.size_unit,
      farm_type: farm.farm_type,
      soil_type: farm.soil_type,
      crop_density: farm.crop_density,
      lat: farm.lat,
      lon: farm.lon,
      setup_status: farm.setup_status,
    };
  }

  private buildSystemPrompt(farmId: string): string {
    return `You are an AI assistant for BeOrchid, an agricultural intelligence platform.
You help farmers understand the health, risks, and status of their farms.
You have access to real-time data for farm ${farmId} via the provided tools.
Always retrieve relevant data before answering. Be concise, specific, and actionable.
When referencing scores, explain what they mean (e.g. a soil health of 65/100 means moderate soil conditions).`;
  }
}
