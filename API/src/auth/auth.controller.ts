import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { LoginDto } from './dto/LoginDto';
import { ApiResponse } from 'src/common/lib/ApiResponse';
import { UserDetails } from 'src/common/dto/UserDetails';
import { successResponse } from 'src/common/utils/api-response-utils';
import { EMAIL_REGEX } from 'src/common/lib/regex/email.regex';
import { type Request, type Response } from 'express';
import { REFRESH_TOKEN_COOKIE_NAME } from 'src/common/constants';
import { ApiError } from 'src/common/lib/errors/ApiError';
import { RegisterDto } from './dto/RegisterDto';
import check from 'check-types';
import {
  AUTH_SESSION_VALIDATOR,
  type AuthSessionValidator,
} from './auth.contracts';
import {
  USER_AUTHENTICATOR,
  USER_WRITER,
  type UserAuthenticator,
  type UserWriter,
} from 'src/user/user.contracts';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SESSION_VALIDATOR)
    private readonly authSessionValidator: AuthSessionValidator,
    @Inject(USER_WRITER)
    private readonly userWriter: UserWriter,
    @Inject(USER_AUTHENTICATOR)
    private readonly userAuthenticator: UserAuthenticator,
  ) { }

  @Post('login')
  async login(
    @Body() form: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<UserDetails>> {
    const { loginKey, password } = form;

    // Handle login using email
    if (EMAIL_REGEX.test(loginKey)) {
      const user = await this.userAuthenticator.loginWithEmail(
        loginKey,
        password,
      );

      const { refreshToken } = await this.authSessionValidator.authenticateUser(
        user.id,
      );

      res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken);

      return successResponse('Login successful', {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }

    throw new ApiError(
      'Invalid login credentials',
      HttpStatus.UNAUTHORIZED,
      'ERR_INVALID_CREDENTIALS',
    );
  }

  @Post('register')
  async register(
    @Body() form: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<UserDetails>> {
    const { name, email, password } = form;

    const user = await this.userWriter.createUser(
      { name, email, role: 'user' },
      password,
    );

    const { refreshToken } = await this.authSessionValidator.authenticateUser(
      user.id,
    );

    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken);

    return successResponse('Register successful', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  @Get('refresh')
  async refresh(
    @Req() req: Request,
  ): Promise<ApiResponse<{ userDetails: UserDetails; accessToken: string }>> {
    const { [REFRESH_TOKEN_COOKIE_NAME]: refreshToken } = req.cookies as {
      [REFRESH_TOKEN_COOKIE_NAME]?: string;
    };

    if (!check.string(refreshToken)) {
      throw new ApiError(
        'Not logged in',
        HttpStatus.UNAUTHORIZED,
        'ERR_REFRESH_TOKEN_NOT_FOUND',
      );
    }

    const authSession =
      await this.authSessionValidator.verifyAndRefreshTokenAndAuthSession(
        refreshToken,
      );
    const { userDetails, accessToken } =
      await this.authSessionValidator.refreshByAuthSession(authSession);

    return successResponse('Refresh successful', {
      userDetails,
      accessToken,
    });
  }
}
