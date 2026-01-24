// backend/src/routes/order.routes.js
import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ShippingWilaya from '../models/ShippingWilaya.js';
import nodemailer from 'nodemailer';
import { protect, admin } from '../middlewares/auth.js';
const adminOnly = [protect, admin];

const router = express.Router();






// Config email (mets tes infos Gmail ici)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dhiaezone@gmail.com',       // ← GMAIL
    pass: 'jrdxlyvyciqbindj'          // ← App Password Gmail
  }
});



// Fonction de validation téléphone algérien
function validateAlgerianPhone(phone) {
  // Formats acceptés : 0770123456, 0555123456, 0666123456, +21377123456
  const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
  const regex = /^(0[5-7]\d{8}|\+213[5-7]\d{8})$/;
  return regex.test(cleaned);
}

// POST /api/orders - Créer une commande
router.post('/', async (req, res) => {
  try {
    const {
      productId,
      variantName,
      quantity,
      customerName,
      customerPhone,
      customerEmail,
      wilaya,
      deliveryType,
      address,
      note
    } = req.body;

    // Validation basique
    if (!productId || !quantity || !customerName || !customerPhone || !customerEmail || !wilaya || !deliveryType || !address) {
      return res.status(400).json({ message: 'Tous les champs obligatoires manquent' });
    }

    // Validation téléphone
    if (!validateAlgerianPhone(customerPhone)) {
      return res.status(400).json({ 
        message: 'Numéro de téléphone invalide. Doit être 10 chiffres commençant par 05/06/07 ou +2135/6/7' 
      });
    }

    // Récupérer le produit
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' });

    // Prix unitaire (base + variante si choisi)
    let unitPrice = product.basePrice;
    if (variantName) {
      const variant = product.variants.find(v => v.name === variantName);
      if (variant) unitPrice += variant.priceDifference;
    }

    const subtotal = unitPrice * quantity;

    // Récupérer frais livraison
    
    const shippingWilaya = await ShippingWilaya.findOne({
      nom: { $regex: new RegExp(wilaya, 'i') }  // partial match, very forgiving
    });
    if (!shippingWilaya) {
      return res.status(400).json({ message: `Wilaya non trouvée : ${wilaya}` });
    }

    const shippingFee = deliveryType === 'domicile' ? shippingWilaya.prixDomicile : shippingWilaya.prixAgence;

    // Livraison gratuite ?
    let finalShipping = shippingFee;
    const FREE_THRESHOLD = 20000;
    if (subtotal >= FREE_THRESHOLD) {
      finalShipping = 0;
    }

    const totalPrice = subtotal + finalShipping;

    // Créer la commande
    const newOrder = new Order({
      product: productId,
      variantName,
      quantity,
      customerName,
      customerPhone,
      customerEmail,
      wilaya,
      deliveryType,
      address,
      note,
      productPrice: unitPrice,
      shippingFee: finalShipping,
      totalPrice
    });

    await newOrder.save();

    // Email de confirmation
    const mailOptions = {
      from: 'dhiaezone@gmail.com',
      to: customerEmail,
      subject: 'Confirmation de commande - DZ GAME ZONE',
      html: `
        <h2>Merci pour votre commande ! 🎮</h2>
        <p>Produit : ${product.name} ${variantName ? `(${variantName})` : ''}</p>
        <p>Quantité : ${quantity}</p>
        <p>Prix unitaire : ${unitPrice.toLocaleString()} DA</p>
        <p>Sous-total : ${subtotal.toLocaleString()} DA</p>
        <p>Livraison (${deliveryType}) vers ${wilaya} : ${finalShipping === 0 ? 'GRATUITE' : finalShipping.toLocaleString() + ' DA'}</p>
        <p><strong>Total à payer à la livraison : ${totalPrice.toLocaleString()} DA</strong></p>
        <p>Adresse : ${address}</p>
        <p>Note : ${note || 'Aucune'}</p>
        <p>Nous vous contacterons bientôt sur ${customerPhone} pour confirmer.</p>
        <p>DZ GAME ZONE - Level up ! 🔥</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      message: 'Commande créée et email envoyé !',
      order: newOrder
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur création commande', error: error.message });
  }
});

// GET /api/orders - Lister toutes les commandes (pour toi admin)
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('product', 'name slug')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Erreur', error: error.message });
  }
});

// GET /api/orders/:id - Détails d'une commande spécifique
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('product', 'name slug images basePrice variants') // affiche détails produit
      .lean(); // plus rapide

    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// PUT /api/orders/:id/status
router.put('/:id/status',adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Statut invalide. Valeurs acceptées : ${validStatuses.join(', ')}` });
    }

    // Récupérer la commande actuelle
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    // Si on passe à "confirmed" ou "shipped" → on diminue le stock
    if (status === 'confirmed' || status === 'shipped') {
      const product = await Product.findById(order.product);
      if (!product) {
        return res.status(404).json({ message: 'Produit lié à la commande non trouvé' });
      }

      let stockToDecrease = order.quantity;

      // Si variante spécifique
      if (order.variantName) {
        const variant = product.variants.find(v => v.name === order.variantName);
        if (!variant) {
          return res.status(400).json({ message: 'Variante non trouvée dans le produit' });
        }

        if (variant.stock < stockToDecrease) {
          return res.status(400).json({ message: `Stock insuffisant pour la variante ${order.variantName}` });
        }

        variant.stock -= stockToDecrease;
        await product.save(); // Sauvegarde le produit modifié
      } else {
        // Pas de variante : on diminue le stock global
        if (product.stock < stockToDecrease) {
          return res.status(400).json({ message: 'Stock global insuffisant' });
        }

        product.stock -= stockToDecrease;
        await product.save();
      }
    }

    // Mise à jour du statut
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true }
    );

    // Optionnel : email au client quand statut change
    if (status === 'confirmed' || status === 'shipped') {
      const mailOptions = {
        from: 'tonemail@gmail.com',
        to: updatedOrder.customerEmail,
        subject: `Mise à jour statut commande #${updatedOrder._id}`,
        html: `
          <h2>Bonjour ${updatedOrder.customerName},</h2>
          <p>Votre commande #${updatedOrder._id} est maintenant : <strong>${status.toUpperCase()}</strong> !</p>
          <p>Produit : ${updatedOrder.product} (quantité : ${updatedOrder.quantity})</p>
          <p>Total : ${updatedOrder.totalPrice.toLocaleString()} DA</p>
          <p>Merci de votre confiance !</p>
        `
      };

      await transporter.sendMail(mailOptions);
    }

    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Erreur mise à jour statut', error: error.message });
  }
});

export default router;