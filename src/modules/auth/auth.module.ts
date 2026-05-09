import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';

import { IsString } from 'class-validator';
import bcrypt from 'bcrypt';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { CoreConfigModule } from '../../core/config/configuration.module';
import { TenantId } from '../../core/tenant/tenant.module';
import { UsersModule, UsersService } from '../users/users.module';

export class LoginDto {
  @IsString()
  email!: string;

  @IsString()
  password!: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; tenantId: string; email: string; role: string }): Promise<unknown> {
    return payload;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(tenantId: string, input: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findByEmail(tenantId, input.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash as string);
    if (!passwordMatches) {
      throw new Error('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') ?? '1h') as never,
      }),
      refreshToken: await this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as never,
      }),
    };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@TenantId() tenantId: string, @Body() body: LoginDto) {
    return this.authService.login(tenantId, body);
  }
}

@Module({
  imports: [CoreConfigModule, UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}