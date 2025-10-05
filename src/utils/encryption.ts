import crypto from 'crypto';
import { config } from '../config/environment';

const algorithm = 'aes-256-gcm';

// Generate a proper 32-byte key from the encryption key
const getKey = (): Buffer => {
  const encryptionKey = config.ENCRYPTION_KEY;

  // If the key is already 64 hex characters (32 bytes), use it as-is
  if (encryptionKey.length === 64 && /^[0-9a-fA-F]+$/.test(encryptionKey)) {
    return Buffer.from(encryptionKey, 'hex');
  }

  // Otherwise, hash it to get a consistent 32-byte key
  return crypto.createHash('sha256').update(encryptionKey).digest();
};

const key = getKey();

export const encrypt = (text: string): { encrypted: string; iv: string; tag: string } => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

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
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(encryptedData.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};