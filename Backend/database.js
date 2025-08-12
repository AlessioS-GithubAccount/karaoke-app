const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'sql313.infinityfree.com',
  user: 'if0_39693310',
  password: '068NdrIjcmXI',
  database: 'if0_39693310_karaoke_db',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;

