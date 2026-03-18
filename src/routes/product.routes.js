// backend/src/routes/product.routes.js
import { protect, admin } from '../middlewares/auth.js';
const adminOnly = [protect, admin];
import express from 'express';
import Product from '../models/Product.js';

import { uploadImage, uploadToCloudinary , uploadImages ,uploadMultipleToCloudinary} from '../middlewares/upload.js';

const router = express.Router();



// GET /api/products - Liste avec filtres + pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12; // 12 produits par page (bon pour UI gaming)
    const skip = (page - 1) * limit;

    const {
      brand,
      minPrice,
      maxPrice,
      inStock = 'false',
      search,
      isFeatured
    } = req.query;

    let filter = {};

    if (brand) filter.brand = new RegExp(`^${brand}$`, 'i');
    if (minPrice || maxPrice) {
      filter.basePrice = {};
      if (minPrice) filter.basePrice.$gte = Number(minPrice);
      if (maxPrice) filter.basePrice.$lte = Number(maxPrice);
    }
    if (inStock === 'true') {
      filter.$or = [
        { stock: { $gt: 0 } },
        { 'variants.stock': { $gt: 0 } }
      ];
    }
    if (isFeatured === 'true') filter.isFeatured = true;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ name: regex }, { slug: regex }];
    }
    if (req.query.model) {
      filter['variants.attributes.model'] = req.query.model;
    }
    if (req.query.color) {
      filter['variants.attributes.color'] = req.query.color;
    }
    if (req.query.size) {
      filter['variants.attributes.size'] = req.query.size;
    }

    // Compte total (pour pagination)
    const totalProducts = await Product.countDocuments(filter);

    // Récupère les produits paginés
    const products = await Product.find(filter)
      .sort({ createdAt: -1 }) // récents en premier
      .skip(skip)
      .limit(limit);

    // Métadonnées pagination
    const response = {
      products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
        hasNextPage: page * limit < totalProducts,
        hasPrevPage: page > 1,
        limit
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Erreur filtre produits:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET /api/products/:id → Détails d'un produit
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// POST /api/products
router.post('/', adminOnly, async (req, res) => {
  try {
    let {
      name,
      description,
      brand,
      images,
      tags,
      isFeatured,
      optionTypes = [],     // ← new & important
      variants,             // now must have attributes: Map
    } = req.body;

    // ───────────────────────────────────────────────
    //  Required fields
    // ───────────────────────────────────────────────
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Le nom est obligatoire', field: 'name' });
    }
    if (!description?.trim()) {
      return res.status(400).json({ message: 'La description est obligatoire', field: 'description' });
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ message: 'Au moins une variante est requise', field: 'variants' });
    }
    if (!Array.isArray(optionTypes) || optionTypes.length === 0) {
      return res.status(400).json({
        message: 'Les types d\'options (ex: color, size) sont obligatoires quand il y a des variantes',
        field: 'optionTypes'
      });
    }

    // ───────────────────────────────────────────────
    //  Validate optionTypes structure
    // ───────────────────────────────────────────────
    const optionNames = new Set();
    for (const opt of optionTypes) {
      if (!opt.name?.trim() || !Array.isArray(opt.values) || opt.values.length === 0) {
        return res.status(400).json({
          message: 'Chaque optionType doit avoir un "name" et un tableau "values" non vide',
          field: 'optionTypes'
        });
      }
      const normalizedName = opt.name.trim().toLowerCase();
      if (optionNames.has(normalizedName)) {
        return res.status(400).json({
          message: `Option "${opt.name}" est déclarée plusieurs fois`,
          field: 'optionTypes'
        });
      }
      optionNames.add(normalizedName);
    }

    // ───────────────────────────────────────────────
    //  Validate variants
    // ───────────────────────────────────────────────
    const seenCombinations = new Set();
    let defaultVariant = null;

    for (const [index, variant] of variants.entries()) {
      if (!variant.sku?.trim()) {
        return res.status(400).json({
          message: `SKU manquant pour la variante #${index + 1}`,
          field: `variants[${index}].sku`
        });
      }
      if (typeof variant.price !== 'number' || variant.price < 0) {
        return res.status(400).json({
          message: `Prix invalide pour la variante #${index + 1}`,
          field: `variants[${index}].price`
        });
      }
      if (typeof variant.stock !== 'number' || variant.stock < 0) {
        return res.status(400).json({
          message: `Stock invalide pour la variante #${index + 1}`,
          field: `variants[${index}].stock`
        });
      }
      if (!variant.attributes || typeof variant.attributes !== 'object' || variant.attributes instanceof Array) {
        return res.status(400).json({
          message: `La variante #${index + 1} doit avoir un objet "attributes"`,
          field: `variants[${index}].attributes`
        });
      }

      // Check attributes keys match declared optionTypes
      const attrKeys = Object.keys(variant.attributes);
      if (attrKeys.length !== optionTypes.length) {
        return res.status(400).json({
          message: `La variante #${index + 1} doit avoir exactement ${optionTypes.length} attribut(s) (${optionTypes.map(o => o.name).join(', ')})`,
          field: `variants[${index}].attributes`
        });
      }

      for (const opt of optionTypes) {
        const value = variant.attributes[opt.name];
        if (!value || typeof value !== 'string') {
          return res.status(400).json({
            message: `Valeur manquante ou invalide pour "${opt.name}" dans variante #${index + 1}`,
            field: `variants[${index}].attributes.${opt.name}`
          });
        }
        if (!opt.values.includes(value)) {
          return res.status(400).json({
            message: `Valeur "${value}" non autorisée pour "${opt.name}" (variante #${index + 1})`,
            field: `variants[${index}].attributes.${opt.name}`
          });
        }
      }

      // Detect duplicate combinations
      const comboKey = JSON.stringify(variant.attributes, Object.keys(variant.attributes).sort());
      if (seenCombinations.has(comboKey)) {
        return res.status(400).json({
          message: `Combinaison d'attributs dupliquée dans les variantes (variante #${index + 1})`,
          field: `variants`
        });
      }
      seenCombinations.add(comboKey);

      if (variant.isDefault) {
        if (defaultVariant) {
          return res.status(400).json({ message: 'Une seule variante peut être marquée isDefault' });
        }
        defaultVariant = variant;
      }
    }

    // ───────────────────────────────────────────────
    //  Generate unique slug
    // ───────────────────────────────────────────────
    let slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) slug = 'produit';

    let counter = 1;
    let originalSlug = slug;
    while (await Product.findOne({ slug })) {
      slug = `${originalSlug}-${counter++}`;
    }

    // ───────────────────────────────────────────────
    //  Name uniqueness (case-insensitive)
    // ───────────────────────────────────────────────
    if (await Product.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })) {
      return res.status(409).json({
        message: 'Un produit avec ce nom existe déjà',
        field: 'name'
      });
    }

    // ───────────────────────────────────────────────
    //  Prepare & save
    // ───────────────────────────────────────────────
    const basePrice = defaultVariant?.price ?? variants[0].price;

    const productData = {
      name: name.trim(),
      slug,
      description: description.trim(),
      brand: brand?.trim() || undefined,
      images: Array.isArray(images) ? images : [],
      tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean) : [],
      optionTypes,           // ← saved as-is
      variants,
      basePrice,
      isFeatured: !!isFeatured,
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Erreur création produit:', error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'inconnu';
      return res.status(409).json({
        message: `Conflit d'unicité sur le champ ${field}`,
        field,
      });
    }

    if (error.name === 'ValidationError') {
      const firstError = Object.values(error.errors)[0];
      return res.status(400).json({
        message: firstError?.message || 'Données invalides',
        field: firstError?.path,
      });
    }

    res.status(500).json({
      message: 'Erreur serveur lors de la création du produit',
      error: error.message,
    });
  }
});

// PUT /api/products/:id → Modifier
router.put('/:id',adminOnly, async (req, res) => {
  try {
    const productData = req.body;

    // Régénérer slug si nom changé
    if (productData.name) {
      productData.slug = productData.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .trim();
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, productData, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: 'Produit non trouvé' });

    res.json(updated);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Nom ou slug déjà utilisé' });
    res.status(500).json({ message: 'Erreur modification', error: error.message });
  }
});

// DELETE /api/products/:id → Supprimer
router.delete('/:id',adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' });
    res.json({ message: 'Produit supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur suppression', error: error.message });
  }
});


// POST /api/products/upload-image - Uploader une image et récupérer l'URL
router.post('/upload-image',adminOnly, uploadImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier reçu (champ "image")' });
    }

    const url = await uploadToCloudinary(req.file);
    res.status(200).json({ url });
  } catch (err) {
    console.error('Erreur Cloudinary:', err);
    res.status(500).json({ message: 'Erreur upload image', error: err.message });
  }
});

// POST /api/products/upload-images - Upload multiple images (max 5)
router.post('/upload-images',adminOnly, uploadImages, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucune image reçue (champ "images")' });
    }

    const urls = await uploadMultipleToCloudinary(req.files);
    
    res.status(200).json({ 
      message: `${urls.length} image(s) uploadée(s) avec succès`,
      urls 
    });
  } catch (err) {
    console.error('Erreur upload multiple:', err);
    res.status(500).json({ message: 'Erreur upload multiple', error: err.message });
  }
});

export default router;