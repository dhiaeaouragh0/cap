import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Config Cloudinary (déjà fait)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Stockage en mémoire
const storage = multer.memoryStorage();

// Upload SINGLE image (déjà existant)
export const uploadImage = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
}).single('image');

// Upload MULTIPLE images (nouveau ! max 5 fichiers)
export const uploadImages = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB par fichier
}).array('images', 5); // 'images' = nom du champ, 5 = max fichiers

// Fonction pour uploader UN fichier (déjà existant)
export const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'dz-game-zone' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    ).end(file.buffer);
  });
};

// Fonction pour uploader PLUSIEURS fichiers
export const uploadMultipleToCloudinary = async (files) => {
  const urls = [];
  for (const file of files) {
    const url = await uploadToCloudinary(file);
    urls.push(url);
  }
  return urls;
};