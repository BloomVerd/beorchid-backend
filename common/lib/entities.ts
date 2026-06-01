import { Farmer } from '../../src/modules/farmer/entities/farmer.entity';
import { Farm } from '../../src/modules/farm/entities/farm.entity';
import { Coordinate } from '../../src/modules/farm/entities/coordinate.entity';
import { ImageData } from '../../src/modules/farm/entities/image-data.entity';
import { Prediction } from '../../src/modules/predictions/entities/prediction.entity';
import { PredictionRange } from '../../src/modules/predictions/entities/prediction-range.entity';
import { MagicLinkToken } from '../../src/modules/auth/entities/magic-link-token.entity';
import { RefreshToken } from '../../src/modules/auth/entities/refresh-token.entity';

export const entities = [
  Farmer,
  Farm,
  Coordinate,
  ImageData,
  Prediction,
  PredictionRange,
  MagicLinkToken,
  RefreshToken,
];

export {
  Farmer,
  Farm,
  Coordinate,
  ImageData,
  Prediction,
  PredictionRange,
  MagicLinkToken,
  RefreshToken,
};
