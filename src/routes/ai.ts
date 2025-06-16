import { Router } from 'express';
import { chatWithAI } from '../controllers/aiController';

const router = Router();

// POST /api/ai/chat - Chat with AI for document assistance
router.post('/chat', chatWithAI);

export default router; 