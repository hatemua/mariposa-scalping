import ApiKey, { ApiKeyDocument } from '../models/ApiKey';
import { generateApiKey, validateApiKey } from '../utils/apiKeyGenerator';
import { getTierLimits } from '../config/apiTiers';
import mongoose from 'mongoose';

interface GenerateApiKeyParams {
  userId: string;
  name: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  expiresInDays?: number;
  allowedIPs?: string[];
}

interface GenerateApiKeyResult {
  success: boolean;
  apiKey?: string;  // Full key (shown ONCE)
  keyPrefix?: string;
  keyId?: string;
  message: string;
}

export class ApiKeyService {
  /**
   * Generate a new API key for a user
   */
  async generateApiKey(params: GenerateApiKeyParams): Promise<GenerateApiKeyResult> {
    try {
      const { userId, name, tier, expiresInDays, allowedIPs } = params;

      // Check if user already has an active key with this name
      const existingKey = await ApiKey.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        name,
        isActive: true
      });

      if (existingKey) {
        return {
          success: false,
          message: `An active API key with the name "${name}" already exists`
        };
      }

      // Generate the API key
      const { fullKey, keyPrefix, keyHash } = generateApiKey('live');

      // Get tier limits
      const tierLimits = getTierLimits(tier);

      // Calculate expiration date
      let expiresAt: Date | null = null;
      if (expiresInDays && expiresInDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      // Create API key document
      const apiKeyDoc = new ApiKey({
        userId: new mongoose.Types.ObjectId(userId),
        keyPrefix,
        keyHash,
        name,
        tier,
        requestsPerDay: tierLimits.requestsPerDay,
        requestsPerMinute: tierLimits.requestsPerMinute,
        requestsUsedToday: 0,
        requestsUsedThisMinute: 0,
        lastResetDate: new Date(),
        lastMinuteResetDate: new Date(),
        allowedEndpoints: [],
        allowedIPs: allowedIPs || [],
        isActive: true,
        lastUsedAt: null,
        expiresAt
      });

      await apiKeyDoc.save();

      console.log(`✅ Generated API key for user ${userId}: ${keyPrefix}`);

      return {
        success: true,
        apiKey: fullKey,  // Return full key ONCE
        keyPrefix,
        keyId: (apiKeyDoc._id as any).toString(),
        message: 'API key generated successfully. Store this key securely - it will not be shown again.'
      };

    } catch (error) {
      console.error('Error generating API key:', error);
      return {
        success: false,
        message: 'Failed to generate API key'
      };
    }
  }

  /**
   * Validate an API key and return the associated document
   */
  async validateAndGetApiKey(providedKey: string): Promise<ApiKeyDocument | null> {
    try {
      // Extract prefix from provided key
      const keyPrefixMatch = providedKey.match(/^(mk_(live|test)_[a-f0-9]{8})/);
      if (!keyPrefixMatch) {
        console.warn('⚠️ Invalid API key format');
        return null;
      }

      const keyPrefix = keyPrefixMatch[1];

      // Find API key by prefix
      const apiKey = await ApiKey.findOne({ keyPrefix, isActive: true });
      if (!apiKey) {
        console.warn(`⚠️ API key not found or inactive: ${keyPrefix}`);
        return null;
      }

      // Check if key has expired
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        console.warn(`⚠️ API key expired: ${keyPrefix}`);
        await ApiKey.findByIdAndUpdate(apiKey._id, { isActive: false });
        return null;
      }

      // Validate the hash
      const isValid = validateApiKey(providedKey, apiKey.keyHash);
      if (!isValid) {
        console.warn(`⚠️ API key validation failed: ${keyPrefix}`);
        return null;
      }

      // Update last used timestamp
      await ApiKey.findByIdAndUpdate(apiKey._id, { lastUsedAt: new Date() });

      return apiKey;

    } catch (error) {
      console.error('Error validating API key:', error);
      return null;
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const apiKey = await ApiKey.findOne({
        _id: new mongoose.Types.ObjectId(keyId),
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (!apiKey) {
        return {
          success: false,
          message: 'API key not found'
        };
      }

      await ApiKey.findByIdAndUpdate(keyId, { isActive: false });

      console.log(`🔒 Revoked API key: ${apiKey.keyPrefix}`);

      return {
        success: true,
        message: 'API key revoked successfully'
      };

    } catch (error) {
      console.error('Error revoking API key:', error);
      return {
        success: false,
        message: 'Failed to revoke API key'
      };
    }
  }

  /**
   * Get all API keys for a user (masked)
   */
  async getUserApiKeys(userId: string): Promise<any[]> {
    try {
      const apiKeys = await ApiKey.find({
        userId: new mongoose.Types.ObjectId(userId)
      }).select('-keyHash').sort({ createdAt: -1 });

      return apiKeys.map(key => ({
        id: key._id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        tier: key.tier,
        isActive: key.isActive,
        requestsUsedToday: key.requestsUsedToday,
        requestsPerDay: key.requestsPerDay,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt
      }));

    } catch (error) {
      console.error('Error getting user API keys:', error);
      return [];
    }
  }

  /**
   * Rotate an API key (generate new one, revoke old one)
   */
  async rotateApiKey(keyId: string, userId: string): Promise<GenerateApiKeyResult> {
    try {
      const oldKey = await ApiKey.findOne({
        _id: new mongoose.Types.ObjectId(keyId),
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (!oldKey) {
        return {
          success: false,
          message: 'API key not found'
        };
      }

      // Generate new key with same settings
      const newKeyResult = await this.generateApiKey({
        userId,
        name: `${oldKey.name} (Rotated)`,
        tier: oldKey.tier,
        allowedIPs: oldKey.allowedIPs
      });

      if (newKeyResult.success) {
        // Revoke old key
        await ApiKey.findByIdAndUpdate(keyId, { isActive: false });
        console.log(`🔄 Rotated API key: ${oldKey.keyPrefix} → ${newKeyResult.keyPrefix}`);
      }

      return newKeyResult;

    } catch (error) {
      console.error('Error rotating API key:', error);
      return {
        success: false,
        message: 'Failed to rotate API key'
      };
    }
  }

  /**
   * Increment usage counters for an API key
   */
  async incrementUsage(keyId: string): Promise<void> {
    try {
      const apiKey = await ApiKey.findById(keyId);
      if (!apiKey) return;

      const now = new Date();

      // Reset daily counter if it's a new day
      const lastReset = new Date(apiKey.lastResetDate);
      if (now.toDateString() !== lastReset.toDateString()) {
        apiKey.requestsUsedToday = 0;
        apiKey.lastResetDate = now;
      }

      // Reset minute counter if it's a new minute
      const timeSinceMinuteReset = now.getTime() - new Date(apiKey.lastMinuteResetDate).getTime();
      if (timeSinceMinuteReset >= 60000) {
        apiKey.requestsUsedThisMinute = 0;
        apiKey.lastMinuteResetDate = now;
      }

      // Increment counters
      apiKey.requestsUsedToday += 1;
      apiKey.requestsUsedThisMinute += 1;

      await apiKey.save();

    } catch (error) {
      console.error('Error incrementing usage:', error);
    }
  }

  /**
   * Check if API key has exceeded rate limits
   */
  async checkRateLimits(apiKey: ApiKeyDocument): Promise<{
    allowed: boolean;
    reason?: string;
    resetAt?: Date;
    remaining?: number;
  }> {
    try {
      const now = new Date();

      // Check minute limit
      const timeSinceMinuteReset = now.getTime() - new Date(apiKey.lastMinuteResetDate).getTime();
      if (timeSinceMinuteReset < 60000 && apiKey.requestsUsedThisMinute >= apiKey.requestsPerMinute) {
        const resetAt = new Date(new Date(apiKey.lastMinuteResetDate).getTime() + 60000);
        return {
          allowed: false,
          reason: 'Rate limit exceeded: too many requests per minute',
          resetAt,
          remaining: 0
        };
      }

      // Check daily limit (if not unlimited)
      if (apiKey.requestsPerDay > 0) {
        const lastReset = new Date(apiKey.lastResetDate);
        if (now.toDateString() === lastReset.toDateString() && apiKey.requestsUsedToday >= apiKey.requestsPerDay) {
          const resetAt = new Date(lastReset);
          resetAt.setDate(resetAt.getDate() + 1);
          resetAt.setHours(0, 0, 0, 0);
          return {
            allowed: false,
            reason: 'Rate limit exceeded: daily quota exhausted',
            resetAt,
            remaining: 0
          };
        }
      }

      // Calculate remaining requests
      const remaining = apiKey.requestsPerDay > 0
        ? apiKey.requestsPerDay - apiKey.requestsUsedToday
        : -1; // -1 means unlimited

      return {
        allowed: true,
        remaining
      };

    } catch (error) {
      console.error('Error checking rate limits:', error);
      return { allowed: false, reason: 'Internal error' };
    }
  }
}

export const apiKeyService = new ApiKeyService();
