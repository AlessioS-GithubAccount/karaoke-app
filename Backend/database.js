const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Mysql1990@',
  database: 'karaokedb'
});

conn.connect(err => {
  if (err) {
    console.error('Errore di connessione al database:', err);
    process.exit(1); // uscita se non si connette
  }
  console.log('Connesso al database MySQL!');
});

module.exports = conn;
