import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1748700000000 implements MigrationInterface {
  name = 'InitialSchema1748700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );

    // --- Enums ---
    const enums: [string, string[]][] = [
      ['farms_crop_type_enum', ['MAIZE', 'RICE', 'CASSAVA', 'VEGETABLES']],
      ['farms_size_unit_enum', ['HECTARES']],
      ['farms_farm_type_enum', ['FIELD', 'GREENHOUSE']],
      ['farms_setup_status_enum', ['PENDING', 'IN_PROGRESS', 'COMPLETE']],
      ['farms_soil_type_enum', ['CLAY', 'SANDY', 'LOAM', 'SILT', 'PEAT', 'CHALK']],
      ['iot_devices_device_type_enum', [
        'SOIL_MOISTURE_SENSOR', 'WEATHER_STATION', 'IRRIGATION_CONTROLLER',
        'AERIAL_SCOUT_DRONE', 'FIELD_CAMERA', 'TEMPERATURE_SENSOR',
        'HUMIDITY_SENSOR', 'OTHER',
      ]],
      ['predictions_prediction_type_enum', ['DISEASE_PREDICTION', 'YIELD_PREDICTION']],
      ['predictions_risk_level_enum', ['low', 'moderate', 'high']],
      ['crop_field_health_crop_type_enum', ['MAIZE', 'RICE', 'CASSAVA', 'VEGETABLES']],
      ['crop_field_health_growth_stage_enum', [
        'GERMINATION', 'VEGETATIVE', 'FLOWERING', 'FRUITING', 'HARVEST',
      ]],
      ['disease_alerts_spread_enum', ['INCREASING', 'STABLE', 'DECREASING']],
      ['health_alerts_severity_enum', ['INFO', 'WARNING', 'CRITICAL']],
    ];

    for (const [name, values] of enums) {
      const quoted = values.map((v) => `'${v}'`).join(', ');
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
            CREATE TYPE "${name}" AS ENUM (${quoted});
          END IF;
        END $$
      `);
    }

    // --- farmers ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farmers" (
        "id"           UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "firstName"    CHARACTER VARYING NOT NULL,
        "lastName"     CHARACTER VARYING NOT NULL,
        "email"        CHARACTER VARYING NOT NULL,
        "country"      CHARACTER VARYING NOT NULL,
        "passwordHash" CHARACTER VARYING          NULL,
        "googleId"     CHARACTER VARYING          NULL,
        "isActive"     BOOLEAN           NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_farmers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_farmers_email" UNIQUE ("email")
      )
    `);

    // --- magic_link_tokens ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
        "id"        UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "email"     CHARACTER VARYING NOT NULL,
        "token"     CHARACTER VARYING NOT NULL,
        "expiresAt" TIMESTAMP         NOT NULL,
        "usedAt"    TIMESTAMP                  NULL,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_magic_link_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_magic_link_tokens_token" UNIQUE ("token")
      )
    `);

    // --- refresh_tokens ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id"        UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "farmerId"  UUID              NOT NULL,
        "token"     CHARACTER VARYING NOT NULL,
        "expiresAt" TIMESTAMP         NOT NULL,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_refresh_tokens_farmer"
          FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE CASCADE
      )
    `);

    // --- farms ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farms" (
        "id"              UUID                       NOT NULL DEFAULT uuid_generate_v4(),
        "name"            CHARACTER VARYING          NOT NULL,
        "crop_type"       "farms_crop_type_enum"     NOT NULL DEFAULT 'MAIZE',
        "variety"         CHARACTER VARYING                   NULL,
        "farm_size"       DOUBLE PRECISION           NOT NULL,
        "size_unit"       "farms_size_unit_enum"     NOT NULL DEFAULT 'HECTARES',
        "farm_type"       "farms_farm_type_enum"     NOT NULL DEFAULT 'FIELD',
        "lat"             DOUBLE PRECISION                    NULL,
        "lon"             DOUBLE PRECISION                    NULL,
        "setup_status"    "farms_setup_status_enum"  NOT NULL DEFAULT 'PENDING',
        "soil_type"       "farms_soil_type_enum"              NULL,
        "crop_density"    DOUBLE PRECISION                    NULL,
        "iot_device_ids"  CHARACTER VARYING                   NULL,
        "setup_photo_url" CHARACTER VARYING                   NULL,
        "setup_photo_lat" DOUBLE PRECISION                    NULL,
        "setup_photo_lon" DOUBLE PRECISION                    NULL,
        "createdAt"       TIMESTAMP                  NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP                  NOT NULL DEFAULT now(),
        "farmerId"        UUID                                NULL,
        CONSTRAINT "PK_farms" PRIMARY KEY ("id"),
        CONSTRAINT "FK_farms_farmer"
          FOREIGN KEY ("farmerId") REFERENCES "farmers"("id")
      )
    `);

    // --- coordinates ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coordinates" (
        "id"     UUID             NOT NULL DEFAULT uuid_generate_v4(),
        "order"  INTEGER          NOT NULL,
        "lat"    DOUBLE PRECISION NOT NULL,
        "lon"    DOUBLE PRECISION NOT NULL,
        "farmId" UUID                      NULL,
        CONSTRAINT "PK_coordinates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coordinates_farm"
          FOREIGN KEY ("farmId") REFERENCES "farms"("id")
      )
    `);

    // --- iot_devices ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "iot_devices" (
        "id"              UUID                            NOT NULL DEFAULT uuid_generate_v4(),
        "device_id"       CHARACTER VARYING               NOT NULL,
        "label"           CHARACTER VARYING               NOT NULL,
        "device_type"     "iot_devices_device_type_enum"  NOT NULL,
        "is_active"       BOOLEAN                         NOT NULL DEFAULT false,
        "registered_at"   TIMESTAMP                       NOT NULL DEFAULT now(),
        "thing_name"      CHARACTER VARYING                        NULL,
        "certificate_id"  CHARACTER VARYING                        NULL,
        "certificate_arn" CHARACTER VARYING                        NULL,
        "certificate_pem" TEXT                                     NULL,
        "private_key"     TEXT                                     NULL,
        "public_key"      TEXT                                     NULL,
        "farmId"          UUID                                     NULL,
        CONSTRAINT "PK_iot_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_iot_devices_farm"
          FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE
      )
    `);

    // --- prediction_ranges ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_ranges" (
        "id"                 UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "week_start"         TIMESTAMP NOT NULL,
        "week_end"           TIMESTAMP NOT NULL,
        "regeneration_count" INTEGER   NOT NULL DEFAULT 0,
        "inserted_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "farmId"             UUID               NULL,
        CONSTRAINT "PK_prediction_ranges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_prediction_ranges_farm"
          FOREIGN KEY ("farmId") REFERENCES "farms"("id")
      )
    `);

    // --- image_datas ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "image_datas" (
        "id"                  UUID             NOT NULL DEFAULT uuid_generate_v4(),
        "url"                 CHARACTER VARYING NOT NULL,
        "lat"                 DOUBLE PRECISION  NOT NULL,
        "lon"                 DOUBLE PRECISION  NOT NULL,
        "prediction_types"    CHARACTER VARYING NOT NULL DEFAULT 'DISEASE_PREDICTION',
        "createdAt"           TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMP         NOT NULL DEFAULT now(),
        "farmId"              UUID                       NULL,
        "predictionRangeId"   UUID                       NULL,
        CONSTRAINT "PK_image_datas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_image_datas_farm"
          FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_image_datas_prediction_range"
          FOREIGN KEY ("predictionRangeId") REFERENCES "prediction_ranges"("id") ON DELETE SET NULL
      )
    `);

    // --- predictions ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "predictions" (
        "id"              UUID                               NOT NULL DEFAULT uuid_generate_v4(),
        "lat"             DOUBLE PRECISION                   NOT NULL,
        "lon"             DOUBLE PRECISION                   NOT NULL,
        "prediction_type" "predictions_prediction_type_enum" NOT NULL,
        "risk_level"      "predictions_risk_level_enum"               NULL,
        "createdAt"       TIMESTAMP                          NOT NULL DEFAULT now(),
        "farmId"          UUID                                        NULL,
        "imageId"         UUID                                        NULL,
        CONSTRAINT "PK_predictions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_predictions_farm"
          FOREIGN KEY ("farmId") REFERENCES "farms"("id"),
        CONSTRAINT "FK_predictions_image"
          FOREIGN KEY ("imageId") REFERENCES "image_datas"("id") ON DELETE SET NULL
      )
    `);

    // --- farm_health ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farm_health" (
        "id"            UUID             NOT NULL DEFAULT uuid_generate_v4(),
        "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "soil_health"   DOUBLE PRECISION NOT NULL DEFAULT 0,
        "crop_health"   DOUBLE PRECISION NOT NULL DEFAULT 0,
        "weather_stress" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "disease_risk"  DOUBLE PRECISION NOT NULL DEFAULT 0,
        "computed_at"   TIMESTAMPTZ               NULL,
        "createdAt"     TIMESTAMP        NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP        NOT NULL DEFAULT now(),
        "farmId"        UUID                       NULL,
        CONSTRAINT "PK_farm_health" PRIMARY KEY ("id"),
        CONSTRAINT "FK_farm_health_farm"
          FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE
      )
    `);

    // --- crop_field_health ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crop_field_health" (
        "id"                 UUID                                    NOT NULL DEFAULT uuid_generate_v4(),
        "field_name"         CHARACTER VARYING                       NOT NULL,
        "crop_type"          "crop_field_health_crop_type_enum"      NOT NULL DEFAULT 'MAIZE',
        "health_percent"     DOUBLE PRECISION                        NOT NULL DEFAULT 0,
        "ndvi"               DOUBLE PRECISION                        NOT NULL DEFAULT 0,
        "disease_probability" DOUBLE PRECISION                       NOT NULL DEFAULT 0,
        "disease_type"       CHARACTER VARYING                                NULL,
        "growth_stage"       "crop_field_health_growth_stage_enum"   NOT NULL DEFAULT 'VEGETATIVE',
        "expected_harvest"   CHARACTER VARYING                       NOT NULL,
        "createdAt"          TIMESTAMP                               NOT NULL DEFAULT now(),
        "updatedAt"          TIMESTAMP                               NOT NULL DEFAULT now(),
        "farmHealthId"       UUID                                             NULL,
        CONSTRAINT "PK_crop_field_health" PRIMARY KEY ("id"),
        CONSTRAINT "FK_crop_field_health_farm_health"
          FOREIGN KEY ("farmHealthId") REFERENCES "farm_health"("id") ON DELETE CASCADE
      )
    `);

    // --- disease_alerts ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disease_alerts" (
        "id"              UUID                          NOT NULL DEFAULT uuid_generate_v4(),
        "disease_name"    CHARACTER VARYING             NOT NULL,
        "probability"     DOUBLE PRECISION              NOT NULL DEFAULT 0,
        "first_detected"  TIMESTAMPTZ                   NOT NULL,
        "spread"          "disease_alerts_spread_enum"  NOT NULL DEFAULT 'STABLE',
        "treatment"       TEXT                          NOT NULL,
        "infected_leaves" INTEGER                                NULL,
        "createdAt"       TIMESTAMP                     NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP                     NOT NULL DEFAULT now(),
        "farmHealthId"    UUID                                   NULL,
        CONSTRAINT "PK_disease_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_disease_alerts_farm_health"
          FOREIGN KEY ("farmHealthId") REFERENCES "farm_health"("id") ON DELETE CASCADE
      )
    `);

    // --- health_alerts ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "health_alerts" (
        "id"               UUID                             NOT NULL DEFAULT uuid_generate_v4(),
        "severity"         "health_alerts_severity_enum"    NOT NULL DEFAULT 'INFO',
        "title"            CHARACTER VARYING                NOT NULL,
        "description"      TEXT                             NOT NULL,
        "action"           TEXT                             NOT NULL,
        "estimated_impact" CHARACTER VARYING                NOT NULL,
        "createdAt"        TIMESTAMP                        NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP                        NOT NULL DEFAULT now(),
        "farmHealthId"     UUID                                      NULL,
        CONSTRAINT "PK_health_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_health_alerts_farm_health"
          FOREIGN KEY ("farmHealthId") REFERENCES "farm_health"("id") ON DELETE CASCADE
      )
    `);

    // --- sensor_history_points ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sensor_history_points" (
        "id"           UUID             NOT NULL DEFAULT uuid_generate_v4(),
        "date"         DATE             NOT NULL,
        "moisture"     DOUBLE PRECISION NOT NULL DEFAULT 0,
        "temperature"  DOUBLE PRECISION NOT NULL DEFAULT 0,
        "nitrogen"     DOUBLE PRECISION NOT NULL DEFAULT 0,
        "phosphorus"   DOUBLE PRECISION NOT NULL DEFAULT 0,
        "potassium"    DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMP        NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP        NOT NULL DEFAULT now(),
        "farmHealthId" UUID                      NULL,
        CONSTRAINT "PK_sensor_history_points" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sensor_history_points_farm_health"
          FOREIGN KEY ("farmHealthId") REFERENCES "farm_health"("id") ON DELETE CASCADE
      )
    `);

    // --- yield_comparisons ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "yield_comparisons" (
        "id"                  UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "field_name"          CHARACTER VARYING NOT NULL,
        "current_yield"       DOUBLE PRECISION  NOT NULL DEFAULT 0,
        "last_season_yield"   DOUBLE PRECISION  NOT NULL DEFAULT 0,
        "confidence_min"      DOUBLE PRECISION  NOT NULL DEFAULT 0,
        "confidence_max"      DOUBLE PRECISION  NOT NULL DEFAULT 0,
        "revenue"             DOUBLE PRECISION  NOT NULL DEFAULT 0,
        "createdAt"           TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMP         NOT NULL DEFAULT now(),
        "farmHealthId"        UUID                       NULL,
        CONSTRAINT "PK_yield_comparisons" PRIMARY KEY ("id"),
        CONSTRAINT "FK_yield_comparisons_farm_health"
          FOREIGN KEY ("farmHealthId") REFERENCES "farm_health"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "yield_comparisons"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sensor_history_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "health_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "disease_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crop_field_health"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_health"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "predictions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "image_datas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prediction_ranges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "iot_devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coordinates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "magic_link_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farmers"`);

    const enums = [
      'health_alerts_severity_enum',
      'disease_alerts_spread_enum',
      'crop_field_health_growth_stage_enum',
      'crop_field_health_crop_type_enum',
      'predictions_risk_level_enum',
      'predictions_prediction_type_enum',
      'iot_devices_device_type_enum',
      'farms_soil_type_enum',
      'farms_setup_status_enum',
      'farms_farm_type_enum',
      'farms_size_unit_enum',
      'farms_crop_type_enum',
    ];

    for (const name of enums) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${name}"`);
    }
  }
}
