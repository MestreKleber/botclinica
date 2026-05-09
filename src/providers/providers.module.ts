import { Body, Controller, Global, Inject, Injectable, Module, Param, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import axios, { type AxiosInstance } from 'axios';
import { IsString } from 'class-validator';

import { TenantId } from '../core/tenant/tenant.module';
import { JwtAuthGuard } from '../modules/auth/auth.module';
import { QueueNames, QueueRegistryService } from '../queues/queue.module';

export enum ProviderType {
  EvolutionApi = 'EVOLUTION_API',
}

export interface ProviderContext {
  id: string;
  tenantId: string;
  type: ProviderType;
  name: string;
  externalId?: string | null;
  config?: Record<string, unknown> | null;
}

export interface SendTextInput {
  provider: ProviderContext;
  to: string;
  text: string;
  conversationId?: string;
}

export interface SendMediaInput {
  provider: ProviderContext;
  to: string;
  mediaUrl: string;
  caption?: string;
  conversationId?: string;
}

export interface SendTemplateInput {
  provider: ProviderContext;
  to: string;
  templateName: string;
  variables?: Record<string, string | number | boolean>;
  conversationId?: string;
}

export interface CreateSessionInput {
  provider: ProviderContext;
}

export interface DeleteSessionInput {
  provider: ProviderContext;
}

export interface ProviderWebhookInput {
  provider: ProviderContext;
  payload: unknown;
}

export interface HealthCheckInput {
  provider: ProviderContext;
}

export interface ProviderSendResult {
  providerType: ProviderType;
  externalMessageId: string;
  rawResponse: unknown;
}

export interface ProviderHealthResult {
  providerType: ProviderType;
  healthy: boolean;
  rawResponse: unknown;
}

export interface MessagingProvider {
  sendText(input: SendTextInput): Promise<ProviderSendResult>;
  sendMedia(input: SendMediaInput): Promise<ProviderSendResult>;
  sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult>;
  createSession(input: CreateSessionInput): Promise<unknown>;
  deleteSession(input: DeleteSessionInput): Promise<unknown>;
  webhook(input: ProviderWebhookInput): Promise<unknown>;
  healthCheck(input: HealthCheckInput): Promise<ProviderHealthResult>;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');

export class ProviderWebhookDto {
  @IsString()
  providerId!: string;

  @IsString()
  payload!: Record<string, unknown>;

  @IsString()
  externalId?: string;
}

@Injectable()
export class EvolutionProvider implements MessagingProvider {
  private readonly client: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.client = axios.create({
      baseURL: this.configService.getOrThrow<string>('EVOLUTION_API_BASE_URL'),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.configService.getOrThrow<string>('EVOLUTION_API_KEY'),
      },
    });
  }

  async sendText(input: SendTextInput): Promise<ProviderSendResult> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.post(`/message/sendText/${instance}`, {
      number: input.to,
      text: input.text,
    });
    return this.mapSendResult(response.data);
  }

  async sendMedia(input: SendMediaInput): Promise<ProviderSendResult> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.post(`/message/sendMedia/${instance}`, {
      number: input.to,
      mediaUrl: input.mediaUrl,
      caption: input.caption,
    });
    return this.mapSendResult(response.data);
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.post(`/message/sendTemplate/${instance}`, {
      number: input.to,
      templateName: input.templateName,
      variables: input.variables ?? {},
    });
    return this.mapSendResult(response.data);
  }

  async createSession(input: CreateSessionInput): Promise<unknown> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.post('/instance/create', { instance });
    return response.data;
  }

  async deleteSession(input: DeleteSessionInput): Promise<unknown> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.delete(`/instance/delete/${instance}`);
    return response.data;
  }

  async webhook(input: ProviderWebhookInput): Promise<unknown> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.post(`/webhook/${instance}`, input.payload);
    return response.data;
  }

  async healthCheck(input: HealthCheckInput): Promise<ProviderHealthResult> {
    const instance = this.resolveInstance(input.provider);
    const response = await this.client.get(`/instance/connectionState/${instance}`);
    const healthy = response.data?.state === 'open' || response.data?.status === 'connected';

    return {
      providerType: ProviderType.EvolutionApi,
      healthy,
      rawResponse: response.data,
    };
  }

  private resolveInstance(provider: ProviderContext): string {
    return String(provider.externalId ?? provider.name ?? this.configService.get<string>('EVOLUTION_API_INSTANCE') ?? provider.id);
  }

  private mapSendResult(response: unknown): ProviderSendResult {
    const externalMessageId = this.extractExternalMessageId(response);
    return {
      providerType: ProviderType.EvolutionApi,
      externalMessageId,
      rawResponse: response,
    };
  }

  private extractExternalMessageId(response: unknown): string {
    if (response && typeof response === 'object') {
      const candidate = (response as { messageId?: unknown; key?: { id?: unknown }; id?: unknown }).messageId
        ?? (response as { key?: { id?: unknown } }).key?.id
        ?? (response as { id?: unknown }).id;

      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }

    return crypto.randomUUID();
  }
}

@Controller('providers')
export class ProvidersController {
  constructor(private readonly queueRegistryService: QueueRegistryService) {}

  @Post('webhooks/:providerType/:providerId')
  async receiveWebhook(
    @Param('providerType') providerType: string,
    @Param('providerId') providerId: string,
    @TenantId() tenantId: string,
    @Body() body: ProviderWebhookDto,
  ): Promise<{ accepted: boolean }> {
    await this.queueRegistryService.add(QueueNames.ProviderEvents, 'provider.webhook', {
      tenantId,
      providerType,
      providerId,
      payload: body.payload,
      externalId: body.externalId,
    });

    return { accepted: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':providerId/health')
  async healthCheck(@TenantId() tenantId: string, @Param('providerId') providerId: string): Promise<{ queued: boolean }> {
    await this.queueRegistryService.add(QueueNames.ProviderEvents, 'provider.health', { tenantId, providerId });
    return { queued: true };
  }
}

@Global()
@Module({
  providers: [
    EvolutionProvider,
    {
      provide: MESSAGING_PROVIDER,
      useExisting: EvolutionProvider,
    },
  ],
  controllers: [ProvidersController],
  exports: [MESSAGING_PROVIDER, EvolutionProvider],
})
export class ProvidersModule {}