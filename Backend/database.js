const mysql = require('mysql2/promise');
const fs = require('fs');

const pool = mysql.createPool({
  host: 'developer-projects-db-karaokeapp5.h.aivencloud.com',
  user: 'avnadmin',
  password: 'AVNS_KN_JaDHBbkcjBCMmHzX',
  database: 'karaokeDB',
  port: 24634,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    ca: fs.readFileSync('C:/Users/notic_v0rm88d/Documents/dump/ca.pem')
  }
});

module.exports = pool;


