const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config(); // legge il .env

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_CA_PATH
    ? { ca: fs.readFileSync(process.env.DB_CA_PATH) }
    : undefined
});

module.exports = pool;
