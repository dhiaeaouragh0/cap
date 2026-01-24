// backend/src/routes/shipping-wilaya.routes.js
import express from 'express';
import ShippingWilaya from '../models/ShippingWilaya.js';
import { protect, admin } from '../middlewares/auth.js';
const adminOnly = [protect, admin];

const router = express.Router();


// GET - Liste toutes les wilayas de livraison
router.get('/', async (req, res) => {
  try {
    const wilayas = await ShippingWilaya.find().sort({ numero: 1 });
    res.json(wilayas);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// GET - Une wilaya spécifique par numéro ou nom
router.get('/:id', async (req, res) => {
  try {
    const wilaya = await ShippingWilaya.findOne({
      $or: [
        { numero: Number(req.params.id) },
        { nom: req.params.id }
      ]
    });
    
    if (!wilaya) {
      return res.status(404).json({ message: 'Wilaya non trouvée' });
    }
    res.json(wilaya);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// POST - Ajouter une nouvelle wilaya (le bouton "Ajouter wilaya")
router.post('/',adminOnly, async (req, res) => {
  try {
    const { numero, nom, prixDomicile, prixAgence } = req.body;

    if (!numero || !nom || prixDomicile == null || prixAgence == null) {
      return res.status(400).json({ message: 'Tous les champs obligatoires : numero, nom, prixDomicile, prixAgence' });
    }

    const nouvelleWilaya = new ShippingWilaya({
      numero,
      nom,
      prixDomicile,
      prixAgence
    });

    await nouvelleWilaya.save();
    res.status(201).json(nouvelleWilaya);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Cette wilaya existe déjà (numéro ou nom)' });
    }
    res.status(500).json({ message: 'Erreur création', error: err.message });
  }
});

// PUT - Modifier une wilaya (ex: changer les prix)
router.put('/:numero',adminOnly, async (req, res) => {
  try {
    const { nom, prixDomicile, prixAgence } = req.body;

    const updated = await ShippingWilaya.findOneAndUpdate(
      { numero: Number(req.params.numero) },
      { nom, prixDomicile, prixAgence, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Wilaya non trouvée' });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Erreur modification', error: err.message });
  }
});

// DELETE - Supprimer une wilaya
router.delete('/:numero',adminOnly, async (req, res) => {
  try {
    const deleted = await ShippingWilaya.findOneAndDelete({ numero: Number(req.params.numero) });
    if (!deleted) {
      return res.status(404).json({ message: 'Wilaya non trouvée' });
    }
    res.json({ message: 'Wilaya supprimée avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur suppression', error: err.message });
  }
});

export default router;