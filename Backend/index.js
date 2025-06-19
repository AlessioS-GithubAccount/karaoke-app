const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();          // <-- definisci app qui
const PORT = 3000;
const SECRET_KEY = 'karaoke_super_segreto';

app.use(cors());
app.use(express.json());

// 🔐 AUTH - Login senza risposta segreta
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenziali non valide' });
    }

    const user = rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ message: 'Credenziali non valide' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, ruolo: user.ruolo }, SECRET_KEY, {
      expiresIn: '2h',
    });

    res.json({ message: 'Login riuscito', token, ruolo: user.ruolo });
  } catch (err) {
    console.error('Errore nel login:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

// Puoi aggiungere qui altre rotte...

// Avvio server
app.listen(PORT, () => {
  console.log(`🚀 Server attivo su http://localhost:${PORT}`);
});
