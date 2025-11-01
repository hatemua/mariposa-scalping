import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Generate a secure API key
 * Format: mk_live_1234567890abcdef...
 */
export function generateApiKey(environment: 'live' | 'test' = 'live'): { fullKey: string; keyPrefix: string; keyHash: string } {
  // Generate random 32-byte string
  const randomBytes = crypto.randomBytes(32).toString('hex');

  // Create prefix (visible part)
  const prefixRandom = randomBytes.substring(0, 8);
  const keyPrefix = `mk_${environment}_${prefixRandom}`;

  // Full key includes the prefix + secret part
  const fullKey = `${keyPrefix}${randomBytes.substring(8)}`;

  // Hash the full key for storage
  const keyHash = bcrypt.hashSync(fullKey, 10);

  return {
    fullKey,      // Return to user ONCE
    keyPrefix,    // Store in DB (for display)
    keyHash       // Store in DB (for validation)
  };
}

/**
 * Validate an API key against its hash
 */
export function validateApiKey(providedKey: string, storedHash: string): boolean {
  return bcrypt.compareSync(providedKey, storedHash);
}

/**
 * Extract key prefix from full key
 */
export function extractKeyPrefix(fullKey: string): string | null {
  const match = fullKey.match(/^(mk_(live|test)_[a-f0-9]{8})/);
  return match ? match[1] : null;
}

/**
 * Mask API key for display
 * Example: mk_live_abc123...xyz789
 */
export function maskApiKey(keyPrefix: string): string {
  if (keyPrefix.length <= 20) {
    return keyPrefix + '...';
  }
  return keyPrefix + '...';
}
