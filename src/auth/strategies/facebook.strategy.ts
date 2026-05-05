import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      clientID: configService.get('FACEBOOK_APP_ID', ''),
      clientSecret: configService.get('FACEBOOK_APP_SECRET', ''),
      callbackURL: configService.get(
        'FACEBOOK_CALLBACK_URL',
        'http://localhost:5000/auth/facebook/callback',
      ),
      scope: ['email'],
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: any, user?: any) => void,
  ) {
    const { id, displayName, emails, photos } = profile;
    const user = await this.userService.findOrCreateOAuthUser({
      provider: 'facebook',
      providerId: id,
      email: emails?.[0]?.value ?? '',
      fullName: displayName,
      profile_url: photos?.[0]?.value,
    });
    done(null, user);
  }
}
