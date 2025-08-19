const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

let sslConfig;

if (process.env.DB_CA) {
  // Se è presente la variabile ambiente, la usiamo direttamente
  sslConfig = { ca: process.env.DB_CA };
} else if (process.env.DB_CA_PATH) {
  // Altrimenti, fallback al file locale
  sslConfig = { ca: fs.readFileSync(process.env.DB_CA_PATH) };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: sslConfig,
});

module.exports = pool;
