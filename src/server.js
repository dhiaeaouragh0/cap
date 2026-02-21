// backend/src/server.js
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import dashboard from './routes/dashboard.routes.js'
import authRoutes from './routes/auth.routes.js';


import shippingWilayaRoutes from './routes/shipping-wilaya.routes.js';

const app = express();

app.use(cors());
app.use(express.json());


// Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.use('/api/shipping-wilayas', shippingWilayaRoutes);
app.use('/api/dashboard', dashboard);

// Route de test
app.get('/', (req, res) => {
  res.send('DZ GAME ZONE Backend - Tout est prêt ! 🚀');
});

const PORT = process.env.PORT || 5000;

// Connexion DB puis démarrage serveur
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur démarré sur le port ${PORT} !`);
  });
});

app.use('/api/auth', authRoutes);
