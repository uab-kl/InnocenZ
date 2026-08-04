import { Router } from 'express';
import { WhatsAppWebhookControllerClass } from './whatsapp.controller.js';

const whatsappWebhookController = new WhatsAppWebhookControllerClass();
const router = Router();

router.get('/', whatsappWebhookController.verify.bind(whatsappWebhookController));
router.post('/', whatsappWebhookController.receive.bind(whatsappWebhookController));

export default router;
