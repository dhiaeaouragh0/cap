// backend/src/models/Order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // Variant choisi
    variantSku: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      min: 1,
      default: 1,
    },

    // Snapshot prix (sécurité)
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingFee: {
      type: Number,
      required: true,
      min: 0,
    },

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Client
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },

    wilaya: {
      type: String,
      required: true,
      uppercase: true,
    },
    deliveryType: {
      type: String,
      enum: ["domicile", "agence"],
      required: true,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },

    note: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);