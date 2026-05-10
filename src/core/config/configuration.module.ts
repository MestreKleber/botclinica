import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsString()
  APP_NAME = 'newbot';

  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN = '1h';

  @IsString()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsString()
  EVOLUTION_API_BASE_URL!: string;

  @IsString()
  EVOLUTION_API_KEY!: string;

  @IsOptional()
  @IsString()
  EVOLUTION_API_INSTANCE?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_DEFAULT_MODEL?: string;

  @IsInt()
  @Min(1)
  OPENAI_MAX_CONCURRENCY = 2;

  @IsInt()
  @Min(1)
  OPENAI_RATE_LIMIT_PER_MIN = 60;

  @IsOptional()
  @IsString()
  LOG_LEVEL = 'info';

  @IsInt()
  @Min(1)
  DELAYED_SEND_WINDOW_SECONDS = 15;

  @IsInt()
  @Min(1)
  HUMAN_TAKEOVER_GRACE_SECONDS = 300;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: true,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Environment validation failed: ${messages.join('; ')}`);
  }

  return env;
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate: validateEnvironment,
    }),
  ],
  exports: [ConfigModule],
})
export class CoreConfigModule {}