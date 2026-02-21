// backend/src/models/Product.js
import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // ex: "Black Cap", "Red Edition"
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
      default: [],
    },
    tags: {
      type: [String],
      default: [], // "street", "sport"
    },
    variants: {
      type: [variantSchema],
      required: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    // BASE PRICE → price of default variant
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
  }
  // no next() needed in async functions
});

export default mongoose.model("Product", productSchema);