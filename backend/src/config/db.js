import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Destructure Pool from the pg package
const { Pool } = pg;

// Initialize a connection pool instead of a single client
const db = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

// Test the connection when the app starts
db.connect()
    .then(() => console.log("Connected to PostgreSQL Database"))
    .catch(err => console.error("Failed to connect to PostgreSQL:", err));

// Catch background errors so they don't crash your Node server
db.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Export it so server.js can use it!
export default db;