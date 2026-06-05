import express from 'express';
import multer from 'multer';
import { processWorkout } from '../controllers/workoutController.js';

const router = express.Router();

// Set up Multer
const upload = multer({ dest: 'uploads/' }); 

// When a POST request hits this route, parse the file, then run the controller
router.post('/upload', upload.single('file'), processWorkout);

export default router;