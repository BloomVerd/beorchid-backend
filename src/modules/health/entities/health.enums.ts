import { registerEnumType } from '@nestjs/graphql';

export enum GrowthStage {
  GERMINATION = 'GERMINATION',
  VEGETATIVE = 'VEGETATIVE',
  FLOWERING = 'FLOWERING',
  FRUITING = 'FRUITING',
  HARVEST = 'HARVEST',
}

export enum DiseaseSpread {
  INCREASING = 'INCREASING',
  STABLE = 'STABLE',
  DECREASING = 'DECREASING',
}

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

registerEnumType(GrowthStage, { name: 'GrowthStage' });
registerEnumType(DiseaseSpread, { name: 'DiseaseSpread' });
registerEnumType(AlertSeverity, { name: 'AlertSeverity' });
