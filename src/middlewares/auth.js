// backend/src/middlewares/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';  // on va créer ce modèle après

export const protect = async (req, res, next) => {
  let token;

  // Récupère le token depuis l'en-tête Authorization: Bearer <token>
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Non autorisé - aucun token fourni' });
  }

  try {
    // Vérifie et décode le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Récupère l'utilisateur (sans le password)
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }

    next(); // OK, passe à la route suivante
  } catch (err) {
    console.error('Erreur token:', err);
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

// Middleware admin (optionnel – pour routes ultra-sensibles)
export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Accès réservé aux admins' });
  }
};