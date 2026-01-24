import express from 'express';
import Category from '../models/Category.js';

const router = express.Router();

import { protect, admin } from '../middlewares/auth.js';
const adminOnly = [protect, admin];


// GET /api/categories → Liste toutes
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().populate('parent');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET /api/categories/:id → Détails d'une catégorie
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate('parent');
    if (!category) return res.status(404).json({ message: 'Catégorie non trouvée' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// POST /api/categories → Créer (déjà fait, on garde)
router.post('/',adminOnly, async (req, res) => {
  try {
    const { name, description, parent } = req.body;

    if (!name) return res.status(400).json({ message: 'Le nom est obligatoire' });

    let slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .trim();

    const newCategory = new Category({ name, slug, description: description || '', parent: parent || null });
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Cette catégorie existe déjà (nom ou slug)' });
    res.status(500).json({ message: 'Erreur création', error: error.message });
  }
});

// PUT /api/categories/:id → Modifier
router.put('/:id',adminOnly, async (req, res) => {
  try {
    const { name, description, parent } = req.body;

    // On peut modifier le nom → on régénère le slug si nom changé
    let updateData = { description, parent };
    if (name) {
      updateData.name = name;
      updateData.slug = name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .trim();
    }

    const updated = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Catégorie non trouvée' });

    res.json(updated);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Nom ou slug déjà utilisé' });
    res.status(500).json({ message: 'Erreur modification', error: error.message });
  }
});

// DELETE /api/categories/:id → Supprimer
router.delete('/:id',adminOnly, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: 'Catégorie non trouvée' });

    // Optionnel : supprimer aussi les sous-catégories (à activer si besoin)
    await Category.deleteMany({ parent: req.params.id });

    res.json({ message: 'Catégorie supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur suppression', error: error.message });
  }
});

export default router;