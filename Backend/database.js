const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'sql7.freesqldatabase.com',
  user: 'sql7793261',
  password: 'AiTxTszAmQ',
  database: 'sql7793261',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;

