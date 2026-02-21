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
    let { name, description, basePrice, brand, images, variants, stock, specs, discount, isFeatured } = req.body;

    if (!name || !basePrice) {
      return res.status(400).json({ message: 'Nom et prix de base obligatoires' });
    }

    // Générer slug de base
    let slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .trim();

    // Vérifier si slug existe déjà
    let existing = await Product.findOne({ slug });
    let counter = 1;
    while (existing) {
      slug = `${slug}-${counter}`; // ou `${slug}-${Date.now().toString().slice(-6)}`
      existing = await Product.findOne({ slug });
      counter++;
    }

    // Vérifier nom (si tu veux aussi unique sur name)
    existing = await Product.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(409).json({ message: 'Nom de produit déjà utilisé', field: 'name' });
    }

    const productData = {
      name,
      slug,
      description,
      basePrice,
      brand: brand || '',
      images: images || [],
      variants: variants || [],
      stock: stock || 0,
      specs: specs || {},
      discount: discount || 0,
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