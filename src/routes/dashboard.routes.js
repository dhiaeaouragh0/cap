import express from 'express';
import { protect, admin } from '../middlewares/auth.js';
import { getSummary } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/summary', protect, admin, getSummary);

export default router;
