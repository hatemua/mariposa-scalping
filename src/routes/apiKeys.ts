import express from 'express';
import {
  generateApiKey,
  getUserApiKeys,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage
} from '../controllers/apiKeyController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// All routes require authentication (OTP/JWT)
router.use(authenticate);

/**
 * @route POST /api/api-keys/generate
 * @desc Generate a new API key
 * @body { name: string, tier: string, expiresInDays?: number, allowedIPs?: string[] }
 */
router.post('/generate', generateApiKey);

/**
 * @route GET /api/api-keys
 * @desc Get all API keys for the user
 */
router.get('/', getUserApiKeys);

/**
 * @route DELETE /api/api-keys/:keyId
 * @desc Revoke an API key
 */
router.delete('/:keyId', revokeApiKey);

/**
 * @route POST /api/api-keys/:keyId/rotate
 * @desc Rotate an API key (generate new, revoke old)
 */
router.post('/:keyId/rotate', rotateApiKey);

/**
 * @route GET /api/api-keys/:keyId/usage
 * @desc Get usage analytics for an API key
 * @query { from?: string, to?: string }
 */
router.get('/:keyId/usage', getApiKeyUsage);

export default router;
