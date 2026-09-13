import jwt, { JwtPayload } from 'jsonwebtoken';
import { UserTokenInfo } from './jwt.model.js';
import { logger } from '@/util/logger.js';
import { env } from '@/env';

interface TokenPayload extends JwtPayload, UserTokenInfo {
  /**
   * WHICH KIND OF TOKEN THIS IS.
   *
   * 🔴 Added because there was no way to tell. Both generators signed the
   * IDENTICAL payload with the same key, and `verifyToken` checks signature,
   * algorithm and expiry — nothing else — so a REFRESH token was accepted
   * everywhere an access token was. Proved live against a running server:
   * `GET /auth/me` answered 200 for a refresh token. The web app keeps that
   * value in `localStorage` under `refresh_token`, so the short access-token
   * life bought nothing: whoever read that key held 7 days of full API access.
   *
   * ⚠️ OPTIONAL, and an ABSENT type means ACCESS. Every token already issued
   * carries no `type`, and refusing those would sign out the entire platform on
   * deploy. Only an explicit `'refresh'` is turned away.
   */
  type?: 'access' | 'refresh';
}

class JwtControllerClass {
  private privateKey: string;
  private publicKey: string;

  constructor() {
    this.privateKey = env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    this.publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

    if (!this.privateKey || !this.publicKey) {
      logger.warn('[JwtController] JWT keys not properly configured');
    }
  }

  generateAccessToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      throw new Error('Private key is not defined in environment variables');
    }

    return jwt.sign({ ...userTokenInfo, type: 'access' }, this.privateKey, {
      algorithm: env.JWT_ALGORITHM as jwt.Algorithm,
      expiresIn: env.JWT_ACCESS_TOKEN_EXPIRATION as jwt.SignOptions['expiresIn'],
    });
  }

  generateRefreshToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      throw new Error('Private key is not defined in environment variables');
    }

    return jwt.sign({ ...userTokenInfo, type: 'refresh' }, this.privateKey, {
      algorithm: env.JWT_ALGORITHM as jwt.Algorithm,
      expiresIn: env.JWT_REFRESH_TOKEN_EXPIRATION as jwt.SignOptions['expiresIn'],
    });
  }

  verifyToken(token: string): TokenPayload {
    if (!this.publicKey) {
      throw new Error('Public key is not defined in environment variables');
    }

    return jwt.verify(token, this.publicKey, {
      algorithms: [env.JWT_ALGORITHM as jwt.Algorithm],
    }) as TokenPayload;
  }
}

/**
 * May this token be spent on an ordinary request?
 *
 * A refresh token may not — it buys a new access token at `/auth/refresh` and
 * nothing else. An UNTYPED token may, because every token minted before the
 * `type` claim existed is untyped and those sessions have to keep working.
 */
export function isRefreshToken(payload: { type?: string } | null | undefined): boolean {
  return payload?.type === 'refresh';
}

export { JwtControllerClass };
