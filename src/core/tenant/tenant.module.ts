import { BadRequestException, Global, Injectable, Module, NestMiddleware, NestModule, createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getContext(): TenantContext | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string {
    const context = this.getContext();
    if (!context?.tenantId) {
      throw new Error('Tenant context is not available');
    }

    return context.tenantId;
  }
}

export interface TenantRequest extends Request {
  tenantId?: string;
}

export const TenantId = createParamDecorator((_, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<TenantRequest>();
  const tenantId = request.tenantId ?? request.header('x-tenant-id');
  if (!tenantId) {
    throw new Error('Missing tenant identifier');
  }

  return tenantId;
});

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(request: Request, _response: Response, next: () => void): void {
    const tenantId = (request as TenantRequest).tenantId ?? request.header('x-tenant-id');
    if (!tenantId) {
      throw new BadRequestException('Missing x-tenant-id header');
    }

    (request as TenantRequest).tenantId = tenantId;
    this.tenantContextService.run({ tenantId }, next);
  }
}

@Global()
@Module({
  providers: [TenantContextService, TenantMiddleware],
  exports: [TenantContextService, TenantMiddleware],
})
export class TenantModule implements NestModule {
  configure(): void {}
}