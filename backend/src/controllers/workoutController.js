import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import db from '../config/db.js';

export const processWorkout = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });

        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path), req.file.originalname);
        formData.append('exercise_key', req.body.exercise_key || 'biceps_curl');

        const response = await axios.post(process.env.PYTHON_API_URL, formData, {
            headers: formData.getHeaders(),
        });

        fs.unlinkSync(req.file.path);

        const { summary, exercise } = response.data;

        const insertQuery = `
            INSERT INTO workouts
                (exercise_type, total_reps, average_score, flag_counts, iqr_outlier_reps, ml_outlier_reps)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;

        await db.query(insertQuery, [
            exercise,
            summary.total_reps,
            summary.average_score,
            JSON.stringify(summary.flag_counts),   // store as JSON text
            summary.iqr_outlier_reps,
            summary.ml_outlier_reps,
        ]);

        res.json(response.data);

    } catch (error) {
        if (error.response) {
            console.error('Python API Error:', error.response.data);
            res.status(500).json({ error: error.response.data });
        } else {
            console.error('Controller Error:', error.message);
            res.status(500).json({ error: error.message });
        }
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
};