import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import workoutRoutes from './routes/workoutRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
// Any request starting with /api/workouts will be handled by workoutRoutes
app.use('/api/workouts', workoutRoutes);

app.listen(port, () => {
    console.log(`Node.js Gateway running on http://localhost:${port}`);
});