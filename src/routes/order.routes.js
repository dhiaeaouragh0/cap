// backend/src/routes/order.routes.js
import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ShippingWilaya from '../models/ShippingWilaya.js';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { protect, admin, confirmateur } from '../middlewares/auth.js';

const adminOnly = [protect, admin];
const confirmateurOnly = [protect, confirmateur]; // admin et confirmateur peuvent accéder

const router = express.Router();

// Limite : max 5 commandes par IP toutes les 15 minutes (ajuste selon tes besoins)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // max 5 requêtes par IP dans la fenêtre
  message: {
    message: 'Trop de commandes envoyées. Réessayez dans 15 minutes.'
  },
  standardHeaders: true,     // retourne les headers RateLimit-*
  legacyHeaders: false,
});

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
router.post('/', orderLimiter, async (req, res) => {
  try {
    const {
      productId,
      variantSku,
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
    if (
      !productId ||
      !variantSku ||
      !quantity ||
      !customerName ||
      !customerPhone ||
      !wilaya ||
      !deliveryType ||
      !address
    ) {
      return res.status(400).json({ message: 'Tous les champs obligatoires sont requis' });
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

    // Récupérer le variant choisi par SKU
    const variant = product.variants.find(v => v.sku === variantSku);
    if (!variant) return res.status(400).json({ message: 'Variant non trouvé pour ce produit' });

    // Prix unitaire
    const unitPrice = variant.price;

    const subtotal = unitPrice * quantity;

    // Récupérer frais livraison
    const shippingWilaya = await ShippingWilaya.findOne({
      nom: { $regex: new RegExp(wilaya, 'i') }
    });
    if (!shippingWilaya) {
      return res.status(400).json({ message: `Wilaya non trouvée : ${wilaya}` });
    }

    const shippingFee = deliveryType === 'domicile' ? shippingWilaya.prixDomicile : shippingWilaya.prixAgence;

    // Livraison gratuite ?
    const FREE_THRESHOLD = 20000;
    const finalShipping = subtotal >= FREE_THRESHOLD ? 0 : shippingFee;

    const totalPrice = subtotal + finalShipping;

    // Créer la commande
    const newOrder = new Order({
      product: productId,
      variantSku,
      quantity,
      customerName,
      customerPhone,
      customerEmail: customerEmail || '',
      wilaya,
      deliveryType,
      address,
      note: note || '',
      unitPrice,
      shippingFee: finalShipping,
      totalPrice
    });

    await newOrder.save();

    // Email de confirmation
    if (customerEmail) {
      const mailOptions = {
        from: 'dhiaezone@gmail.com',
        to: customerEmail,
        subject: 'Confirmation de commande - DZ GAME ZONE',
        html: `
          <h2>Merci pour votre commande ! 🎮</h2>
          <p>Produit : ${product.name} (${variant.name})</p>
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
    }

    res.status(201).json({
      message: 'Commande créée et email envoyé !',
      order: newOrder
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur création commande', error: error.message });
  }
});

// GET /api/orders - Lister avec pagination + filtres
router.get('/', confirmateurOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    // Optional: add search support if you want (by customer name/phone/email)
    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { customerName: regex },
        { customerPhone: regex },
        { customerEmail: regex },
      ];
    }

    // Count total matching documents
    const totalOrders = await Order.countDocuments(filter);

    // Fetch paginated orders
    const orders = await Order.find(filter)
      .populate('product', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
      hasNextPage: page * limit < totalOrders,
      hasPrevPage: page > 1,
    });
  } catch (error) {
    console.error('Erreur liste commandes:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET /api/orders/:id - Détails d'une commande spécifique
router.get('/:id', confirmateurOnly, async (req, res) => {
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
router.put('/:id/status', confirmateurOnly, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = [
      'pending',
      'confirmed',
      'shipped',
      'delivered',
      'cancelled',
      'returned'
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Statut invalide. Valeurs acceptées : ${validStatuses.join(', ')}`,
      });
    }

    // Récupérer la commande
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    // Vérifier si le statut change vraiment (évite des opérations inutiles)
    if (order.status === status) {
      return res.json(order); // déjà au bon statut → on renvoie tel quel
    }

    // ────────────────────────────────────────────────
    // Gestion du stock seulement si le statut change vers/depuis des états critiques
    // ────────────────────────────────────────────────

    const previousStatus = order.status;
    const isDecreasingStock = status === 'confirmed';
    const isRestoringStock =
      (previousStatus === 'confirmed' || previousStatus === 'shipped') &&
      (status === 'cancelled' || status === 'returned');

    if (isDecreasingStock || isRestoringStock) {
      const product = await Product.findById(order.product);
      if (!product) {
        return res.status(404).json({ message: 'Produit lié à la commande non trouvé' });
      }

      if (!order.variantSku) {
        return res.status(400).json({ message: 'Référence variante (variantSku) manquante dans la commande' });
      }

      const variant = product.variants.find((v) => v.sku === order.variantSku);
      if (!variant) {
        return res.status(400).json({
          message: `Variante avec SKU ${order.variantSku} non trouvée dans le produit`,
        });
      }

      const quantity = order.quantity;

      if (isDecreasingStock) {
        if (variant.stock < quantity) {
          return res.status(400).json({
            message: `Stock insuffisant pour ${product.name} - ${variant.name} (${variant.stock} restant, besoin : ${quantity})`,
          });
        }
        variant.stock -= quantity;
      } else if (isRestoringStock) {
        variant.stock += quantity; // remise en stock
      }

      // Mise à jour du prix de base (optionnel mais cohérent)
      const defaultVariant = product.variants.find((v) => v.isDefault) || product.variants[0];
      if (defaultVariant) {
        product.basePrice = defaultVariant.price;
      }

      await product.save();
    }

    // ────────────────────────────────────────────────
    // Préparation des champs à mettre à jour
    // ────────────────────────────────────────────────
    const updateFields = { status };

    if (status === 'confirmed' && previousStatus !== 'confirmed') {
      updateFields.confirmedBy = req.user._id;
      updateFields.confirmedAt = new Date();
    }

    // Ajout à l'historique des statuts
    updateFields.$push = {
      statusHistory: {
        status,
        changedBy: req.user._id,
        role: req.user.role, // Assumant que le modèle User a un champ 'role'
        date: new Date()
      }
    };

    // ────────────────────────────────────────────────
    // Mise à jour du statut de la commande
    // ────────────────────────────────────────────────
    let updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    // Populate pour obtenir le nom du produit
    updatedOrder = await updatedOrder.populate('product', 'name');

    // ────────────────────────────────────────────────
    // Envoi email (seulement si pertinent et email présent)
    // ────────────────────────────────────────────────
    if (updatedOrder.customerEmail && ['confirmed', 'shipped', 'delivered', 'cancelled', 'returned'].includes(status)) {
      try {
        const mailOptions = {
          from: 'dhiaezone@gmail.com',
          to: updatedOrder.customerEmail,
          subject: `Mise à jour de votre commande #${updatedOrder._id.toString().slice(-8).toUpperCase()}`,
          html: `
            <h2>Bonjour ${updatedOrder.customerName},</h2>
            <p>Votre commande #${updatedOrder._id.toString().slice(-8).toUpperCase()} est maintenant :</p>
            <h3 style="color: #8B0000;">${status.toUpperCase()}</h3>
            <p>Produit : ${updatedOrder.product?.name || 'Produit'} × ${updatedOrder.quantity}</p>
            <p>Wilaya : ${updatedOrder.wilaya}</p>
            <p>Total : ${updatedOrder.totalPrice.toLocaleString()} DA</p>
            <p>Merci de votre confiance !</p>
            <small>Équipe DZ GAME ZONE</small>
          `,
        };

        await transporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.error('Erreur envoi email :', mailErr);
        // Ne pas bloquer la réponse API pour une erreur email
      }
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error('Erreur mise à jour statut commande:', error);
    res.status(500).json({
      message: 'Erreur serveur lors de la mise à jour du statut',
      error: error.message,
    });
  }
});

// PUT /api/orders/:id/price - Mettre à jour le prix total
router.put('/:id/price', confirmateurOnly, async (req, res) => {
  try {
    const { newTotalPrice } = req.body;

    if (typeof newTotalPrice !== 'number' || newTotalPrice < 0) {
      return res.status(400).json({ message: 'Le nouveau prix total doit être un nombre positif.' });
    }

    // Récupérer la commande
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const oldTotalPrice = order.totalPrice;

    // Vérifier si le prix change vraiment
    if (oldTotalPrice === newTotalPrice) {
      return res.json(order); // pas de changement → on renvoie tel quel
    }

    // Mise à jour du prix
    order.totalPrice = newTotalPrice;

    // Ajout à l'historique des prix
    order.priceHistory.push({
      oldPrice: oldTotalPrice,
      newPrice: newTotalPrice,
      changedBy: req.user._id,
      role: req.user.role, // Assumant que le modèle User a un champ 'role'
      date: new Date()
    });

    await order.save();

    // Populate pour obtenir le nom du produit
    const updatedOrder = await Order.findById(req.params.id).populate('product', 'name');

    // Envoi email si email présent
    if (updatedOrder.customerEmail) {
      try {
        const mailOptions = {
          from: 'dhiaezone@gmail.com',
          to: updatedOrder.customerEmail,
          subject: `Mise à jour du prix de votre commande #${updatedOrder._id.toString().slice(-8).toUpperCase()}`,
          html: `
            <h2>Bonjour ${updatedOrder.customerName},</h2>
            <p>Le prix de votre commande #${updatedOrder._id.toString().slice(-8).toUpperCase()} a été mis à jour.</p>
            <p>Ancien total : ${oldTotalPrice.toLocaleString()} DA</p>
            <p>Nouveau total : ${newTotalPrice.toLocaleString()} DA</p>
            <p>Produit : ${updatedOrder.product?.name || 'Produit'} × ${updatedOrder.quantity}</p>
            <p>Wilaya : ${updatedOrder.wilaya}</p>
            <p>Merci de votre compréhension !</p>
            <small>Équipe DZ GAME ZONE</small>
          `,
        };

        await transporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.error('Erreur envoi email :', mailErr);
        // Ne pas bloquer la réponse API pour une erreur email
      }
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error('Erreur mise à jour prix commande:', error);
    res.status(500).json({
      message: 'Erreur serveur lors de la mise à jour du prix',
      error: error.message,
    });
  }
});

export default router;