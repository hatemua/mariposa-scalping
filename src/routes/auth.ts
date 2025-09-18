import express from 'express';
import { register, login, updateOkxKeys } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.put('/okx-keys', authenticate, updateOkxKeys);

export default router;