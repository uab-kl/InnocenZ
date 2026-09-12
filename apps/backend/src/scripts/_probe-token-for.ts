import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const email = process.argv[2];
console.log(new JwtControllerClass().generateAccessToken({ loginMethod: 'email', loginCriteria: email } as never));
process.exit(0);
