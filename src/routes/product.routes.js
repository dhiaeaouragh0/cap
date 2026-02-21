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
    let { name, description, brand, images, variants, tags, isFeatured } = req.body;

    if (!name || !description || !variants || variants.length === 0) {
      return res.status(400).json({ message: 'Nom, description et au moins un variant sont obligatoires' });
    }

    // Générer slug unique
    let slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .trim();

    let existing = await Product.findOne({ slug });
    let counter = 1;
    while (existing) {
      slug = `${slug}-${counter}`;
      existing = await Product.findOne({ slug });
      counter++;
    }

    // Vérifier nom unique
    existing = await Product.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(409).json({ message: 'Nom de produit déjà utilisé', field: 'name' });
    }

    // Calculer basePrice à partir du variant par défaut
    const defaultVariant = variants.find(v => v.isDefault) || variants[0];
    const basePrice = defaultVariant.price;

    const productData = {
      name,
      slug,
      description,
      basePrice,
      brand: brand || '',
      images: images || [],
      variants,
      tags: tags || [],
      isFeatured: isFeatured || false,
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json(newProduct);
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        message: `Produit existe déjà (${field})`,
        field,
        value: error.keyValue[field],
      });
    }
    res.status(500).json({ message: 'Erreur création produit', error: error.message });
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