// backend/src/server.js
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';


import authRoutes from './routes/auth.routes.js';


import shippingWilayaRoutes from './routes/shipping-wilaya.routes.js';

const app = express();

app.use(cors());
app.use(express.json());


// Routes
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.use('/api/shipping-wilayas', shippingWilayaRoutes);

// Route de test
app.get('/', (req, res) => {
  res.send('DZ GAME ZONE Backend - Tout est prêt ! 🚀');
});

const PORT = process.env.PORT || 5000;

// Connexion DB puis démarrage serveur
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT} !`);
  });
});

app.use('/api/auth', authRoutes);