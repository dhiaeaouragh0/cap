// backend/src/routes/auth.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// POST /api/auth/login - Connexion admin
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe obligatoires' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // token valide 7 jours
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// POST /api/auth/register - Créer un admin (utilise une seule fois !)
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email déjà utilisé' });

    const user = new User({ email, password });
    await user.save();

    res.status(201).json({ message: 'Admin créé avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur création admin', error: err.message });
  }
});

export default router;