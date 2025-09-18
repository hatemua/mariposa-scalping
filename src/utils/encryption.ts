import crypto from 'crypto';
import { config } from '../config/environment';

const algorithm = 'aes-256-gcm';
const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');

export const encrypt = (text: string): { encrypted: string; iv: string; tag: string } => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
};

export const decrypt = (encryptedData: { encrypted: string; iv: string; tag: string }): string => {
  const decipher = crypto.createDecipher(algorithm, key);
  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};