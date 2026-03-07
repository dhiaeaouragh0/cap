// backend/src/routes/auth.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect, admin } from '../middlewares/auth.js'; // Assumant que les middlewares existent

const router = express.Router();

// POST /api/auth/login - Connexion pour tous les rôles
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
      { expiresIn: '30d' } // token valide 7 jours
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

// POST /api/auth/register - Créer un utilisateur (utilise une seule fois pour l'admin initial !)
router.post('/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe obligatoires' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email déjà utilisé' });
    }

    const user = new User({
      email,
      password,
      role: role || 'confirmateur' // Par défaut confirmateur
    });

    await user.save();

    res.status(201).json({
      message: 'Utilisateur créé',
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({
      message: 'Erreur création utilisateur',
      error: err.message
    });
  }
});

// ────────────────────────────────────────────────
// Routes de gestion des utilisateurs (réservées à l'admin)
// ────────────────────────────────────────────────

// GET /api/auth/users - Lister tous les utilisateurs (admin only)
router.get('/users', [protect, admin], async (req, res) => {
  try {
    const users = await User.find({}, 'id email role createdAt'); // Ne pas renvoyer les passwords
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// POST /api/auth/users - Créer un nouvel utilisateur (admin only)
router.post('/users', [protect, admin], async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, mot de passe et rôle obligatoires' });
    }

    if (!['admin', 'confirmateur', 'user'].includes(role)) {
      return res.status(400).json({ message: 'Rôle invalide' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email déjà utilisé' });
    }

    const user = new User({
      email,
      password,
      role
    });

    await user.save();

    res.status(201).json({
      message: 'Utilisateur créé',
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({
      message: 'Erreur création utilisateur',
      error: err.message
    });
  }
});

// PUT /api/auth/users/:id - Mettre à jour un utilisateur (admin only)
router.put('/users/:id', [protect, admin], async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (email) user.email = email;
    if (role) {
      if (!['admin', 'confirmateur', 'user'].includes(role)) {
        return res.status(400).json({ message: 'Rôle invalide' });
      }
      user.role = role;
    }
    if (password) user.password = password; // Le pre-save hook va hasher

    await user.save();

    res.json({
      message: 'Utilisateur mis à jour',
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

// DELETE /api/auth/users/:id - Supprimer un utilisateur (admin only)
router.delete('/users/:id', [protect, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Optionnel : empêcher la suppression de soi-même ou du dernier admin
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous supprimer vous-même' });
    }

    await User.deleteOne({ _id: req.params.id });

    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

export default router;