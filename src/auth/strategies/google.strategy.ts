import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID', ''),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET', ''),
      callbackURL: configService.get(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:5000/auth/google/callback',
      ),
      scope: ['email', 'profile'],
    });
  }

  authenticate(req: any, options?: any) {
    return super.authenticate(req, { ...options, prompt: 'select_account' });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const { id, displayName, emails, photos } = profile;
    const user = await this.userService.findOrCreateOAuthUser({
      provider: 'google',
      providerId: id,
      email: emails[0].value,
      fullName: displayName,
      profile_url: photos?.[0]?.value,
    });
    done(null, user);
  }
}
