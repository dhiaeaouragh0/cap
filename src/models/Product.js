// backend/src/models/Product.js
import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // ex: "Noir", "Gris", "Taille M"
    },
    sku: {
      type: String,
      required: true,
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
    isDefault: {
      type: Boolean,
      default: false,
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
    brand: {
      type: String,
    },
    images: {
      type: [String],
      default: [], // ← on garde le champ mais il sera vide ou supprimé plus tard
    },
    tags: {
      type: [String],
      default: [],
    },
    variants: {
      type: [variantSchema],
      required: true,          // ← maintenant obligatoire
      minlength: 1,            // au moins 1 variante
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

productSchema.pre("save", async function () {
  if (this.variants && this.variants.length > 0) {
    const defaultVariant = this.variants.find(v => v.isDefault) || this.variants[0];
    this.basePrice = defaultVariant.price;

    // Optionnel : forcer la première variante comme default si aucune ne l'est
    if (!this.variants.some(v => v.isDefault)) {
      this.variants[0].isDefault = true;
    }
  }
});

export default mongoose.model("Product", productSchema);