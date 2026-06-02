import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { ChatPubSubService } from './chat-pubsub.service';
import { CLAUDE_TOOLS } from './claude.tools';

@Injectable()
export class ClaudeService {
  private readonly anthropic: Anthropic;
  private readonly MODEL = 'claude-sonnet-4-6';

  constructor(
    private readonly configService: ConfigService,
    private readonly pubSub: ChatPubSubService,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
    @InjectRepository(IotDevice)
    private readonly iotDeviceRepo: Repository<IotDevice>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async streamAndProcess(
    chatId: string,
    farmId: string,
    messages: Anthropic.MessageParam[],
  ): Promise<Anthropic.ContentBlock[]> {
    let currentMessages = [...messages];

    while (true) {
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      const stream = this.anthropic.messages.stream({
        model: this.MODEL,
        max_tokens: 4096,
        system: this.buildSystemPrompt(farmId),
        messages: currentMessages,
        tools: CLAUDE_TOOLS,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_start' &&
          event.content_block.type === 'tool_use'
        ) {
          await this.pubSub.publish(chatId, {
            type: 'tool_use',
            chatId,
            toolName: event.content_block.name,
          });
        }

        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          await this.pubSub.publish(chatId, {
            type: 'token',
            chatId,
            delta: event.delta.text,
          });
        }
      }

      const finalMsg = await stream.finalMessage();

      for (const block of finalMsg.content) {
        if (block.type === 'tool_use') {
          toolUseBlocks.push(block as Anthropic.ToolUseBlock);
        }
      }

      if (finalMsg.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        return finalMsg.content;
      }

      currentMessages.push({ role: 'assistant', content: finalMsg.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map((tu) => this.executeTool(tu, farmId)),
      );

      currentMessages.push({
        role: 'user',
        content: toolResults.map((result, i) => ({
          type: 'tool_result' as const,
          tool_use_id: toolUseBlocks[i].id,
          content: JSON.stringify(result),
        })),
      });
    }
  }

  private async executeTool(
    toolUse: Anthropic.ToolUseBlock,
    farmId: string,
  ): Promise<unknown> {
    switch (toolUse.name) {
      case 'get_farm_health':
        return this.toolGetFarmHealth(farmId);
      case 'get_predictions':
        return this.toolGetPredictions(
          farmId,
          (toolUse.input as { limit?: number }).limit,
        );
      case 'get_iot_devices':
        return this.toolGetIotDevices(farmId);
      case 'get_farm_details':
        return this.toolGetFarmDetails(farmId);
      default:
        return { error: `Unknown tool: ${toolUse.name}` };
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
