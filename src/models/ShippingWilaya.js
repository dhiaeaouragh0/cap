// backend/src/models/ShippingWilaya.js
import mongoose from 'mongoose';

const shippingWilayaSchema = new mongoose.Schema({
  numero: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 69
  },
  nom: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  prixDomicile: {
    type: Number,
    required: true,
    min: 0
  },
  prixAgence: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true  
});

const ShippingWilaya = mongoose.model('ShippingWilaya', shippingWilayaSchema);

export default ShippingWilaya;