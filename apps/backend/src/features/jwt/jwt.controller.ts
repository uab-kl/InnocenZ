import jwt, { JwtPayload } from 'jsonwebtoken';
import { UserTokenInfo } from './jwt.model.js';
import { logger } from '@/util/logger.js';
import { env } from '@/env';

interface TokenPayload extends JwtPayload, UserTokenInfo {}

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

    return jwt.sign(userTokenInfo, this.privateKey, {
      algorithm: env.JWT_ALGORITHM as jwt.Algorithm,
      expiresIn: env.JWT_ACCESS_TOKEN_EXPIRATION as jwt.SignOptions['expiresIn'],
    });
  }

  generateRefreshToken(userTokenInfo: UserTokenInfo): string {
    if (!this.privateKey) {
      throw new Error('Private key is not defined in environment variables');
    }

    return jwt.sign(userTokenInfo, this.privateKey, {
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

export { JwtControllerClass };
