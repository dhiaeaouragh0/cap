// backend/src/models/Product.js
import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    // The actual combination this variant represents
    attributes: {
      type: Map,
      of: String,           // color → "Noir", size → "M", etc.
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const optionTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      // Examples: "color", "size", "material", "storage"
    },
    displayName: {
      type: String,
      trim: true,
      // "Couleur", "Taille", "Matière"
    },
    values: {
      type: [String],
      required: true,
      minlength: 1,
      // ["Noir", "Gris", "Blanc"] or ["S", "M", "L", "XL"]
    },
    // Optional: swatch / preview image per value (very useful for colors)
    swatches: {
      type: Map,
      of: String,           // "Noir" → "/swatches/black.jpg"
      default: () => new Map(),
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
    },
    brand: String,
    images: {
      type: [String],
      default: [], // main product gallery (optional)
    },
    tags: {
      type: [String],
      default: [],
    },

    // Tells frontend/admin which selectors to show and what values are possible
    optionTypes: {
      type: [optionTypeSchema],
      default: [],
    },

    variants: {
      type: [variantSchema],
      required: true,
      minlength: 1,
    },

    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Keep basePrice in sync with default/cheap variant
productSchema.pre('save', function () {
  if (this.variants && this.variants.length > 0) {
    // Find default or fall back to first
    const defaultVariant =
      this.variants.find((v) => v.isDefault) || this.variants[0];

    this.basePrice = defaultVariant.price;

    // Auto-mark first variant as default if none is
    if (!this.variants.some((v) => v.isDefault)) {
      this.variants[0].isDefault = true;
    }
  }
});

// Optional helper (can be instance method or static)
productSchema.methods.getAvailableOptionsFor = function (selectedAttributes) {
  // Example: selectedAttributes = { color: "Noir" }
  // Returns possible sizes/materials/... that still exist
  const remainingKeys = this.optionTypes
    .map((ot) => ot.name)
    .filter((key) => !(key in selectedAttributes));

  if (remainingKeys.length === 0) return {};

  const result = {};
  remainingKeys.forEach((key) => {
    const possible = new Set();
    this.variants.forEach((v) => {
      let matches = true;
      for (const [k, val] of Object.entries(selectedAttributes)) {
        if (v.attributes.get(k) !== val) {
          matches = false;
          break;
        }
      }
      if (matches) {
        possible.add(v.attributes.get(key));
      }
    });
    result[key] = Array.from(possible);
  });
  return result;
};

export default mongoose.model('Product', productSchema);