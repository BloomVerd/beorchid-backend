import { Farmer } from '../../modules/farmer/entities/farmer.entity';
import { Farm } from '../../modules/farm/entities/farm.entity';
import { Coordinate } from '../../modules/farm/entities/coordinate.entity';
import { ImageData } from '../../modules/farm/entities/image-data.entity';
import { Prediction } from '../../modules/predictions/entities/prediction.entity';
import { PredictionRange } from '../../modules/predictions/entities/prediction-range.entity';
import { MagicLinkToken } from '../../modules/auth/entities/magic-link-token.entity';
import { RefreshToken } from '../../modules/auth/entities/refresh-token.entity';

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
