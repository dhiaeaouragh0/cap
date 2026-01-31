// backend/src/models/Product.js
import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, // "Bleu FIFA", "Rouge Kratos"
  },
  sku: {
    type: String,
    required: true,
    // unique: true, ← SUPPRIMÉ ICI ! (plus de contrainte globale)
  },
  priceDifference: {
    type: Number,
    default: 0,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
  },
  images: [{
    type: String,
  }],
  isDefault: {
    type: Boolean,
    default: false,
  },
});

// Index unique : SKU doit être unique SEULEMENT à l'intérieur d'un même produit
variantSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $exists: true } } }
  // Ou pour être plus strict : unique par produit + sku
  // { unique: true, name: 'unique_sku_per_product', partialFilterExpression: { sku: { $exists: true } } }
);

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    // unique: true,  ← Optionnel : tu peux le laisser si tu veux bloquer les noms identiques
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
  },
  description: {
    type: String,
    required: true,
  },
  basePrice: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  brand: {
    type: String,
  },
  images: [{
    type: String,
  }],
  variants: [variantSchema],
  stock: {
    type: Number,
    min: 0,
  },
  specs: {
    type: Map,
    of: String,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index supplémentaire sur slug (déjà unique dans le champ)
// productSchema.index({ slug: 1 }, { unique: true });

// Optionnel : index sur name si tu veux le rendre unique
// productSchema.index({ name: 1 }, { unique: true, sparse: true });

const Product = mongoose.model('Product', productSchema);

export default Product;