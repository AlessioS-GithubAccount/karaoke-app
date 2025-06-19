const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database'); // pool mysql2

const app = express();
const PORT = 3000;
const SECRET_KEY = 'karaoke_super_segreto';

app.use(cors());
app.use(express.json());

// 🔐 LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ message: 'Credenziali non valide' });

    const user = rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) return res.status(401).json({ message: 'Credenziali non valide' });

    const token = jwt.sign({ id: user.id, username: user.username, ruolo: user.ruolo }, SECRET_KEY, { expiresIn: '2h' });
    res.json({ message: 'Login riuscito', token, ruolo: user.ruolo });
  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

// 🎵 GET tutte le canzoni
app.get('/api/canzoni', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM canzoni ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('Errore nel recupero delle canzoni:', err);
    res.status(500).json({ message: 'Errore nel recupero delle canzoni' });
  }
});

// ➕ POST nuova canzone
app.post('/api/canzoni', async (req, res) => {
  const { nome, artista, canzone, tonalita, note } = req.body;
  try {
    await db.query(
      'INSERT INTO canzoni (nome, artista, canzone, tonalita, note) VALUES (?, ?, ?, ?, ?)',
      [nome, artista, canzone, tonalita, note]
    );
    res.json({ message: 'Canzone aggiunta con successo' });
  } catch (err) {
    console.error('Errore aggiunta canzone:', err);
    res.status(500).json({ message: 'Errore durante l\'aggiunta' });
  }
});

// 🔄 PUT toggle cantata
app.put('/api/canzoni/:id/cantata', async (req, res) => {
  const { id } = req.params;
  const { cantata } = req.body;

  try {
    await db.query('UPDATE canzoni SET cantata = ? WHERE id = ?', [cantata, id]);
    res.json({ message: 'Stato cantata aggiornato' });
  } catch (err) {
    console.error('Errore aggiornamento cantata:', err);
    res.status(500).json({ message: 'Errore aggiornamento' });
  }
});

// 🎤 PUT aggiungi partecipante e incrementa numero_richieste
app.put('/api/canzoni/:id/partecipa', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE canzoni SET partecipanti_add = partecipanti_add + 1, numero_richieste = numero_richieste + 1 WHERE id = ?', [id]);
    const [updated] = await db.query('SELECT partecipanti_add FROM canzoni WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) {
    console.error('Errore partecipazione:', err);
    res.status(500).json({ message: 'Errore durante la partecipazione' });
  }
});

// 🧍 GET nome ultimo partecipante
app.get('/api/canzoni/:id/nome-partecipante', async (req, res) => {
  const { id } = req.params;
  try {
    const [row] = await db.query('SELECT nome FROM canzoni WHERE id = ?', [id]);
    res.json({ nome: row[0]?.nome || 'Anonimo' });
  } catch (err) {
    console.error('Errore recupero nome:', err);
    res.status(500).json({ message: 'Errore durante recupero nome' });
  }
});

// 🔁 POST reset lista giornaliera
app.post('/api/reset-canzoni', async (req, res) => {
  const { password } = req.body;
  if (password !== 'karaokeadmin') {
    return res.status(401).json({ message: 'Password errata' });
  }

  try {
    await db.query('UPDATE canzoni SET cantata = 0, partecipanti_add = 0');
    res.json({ message: 'Lista resettata' });
  } catch (err) {
    console.error('Errore reset:', err);
    res.status(500).json({ message: 'Errore durante il reset' });
  }
});

// 🏆 GET Top 20 richieste
app.get('/api/top20', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT canzone, artista, numero_richieste 
      FROM canzoni 
      ORDER BY numero_richieste DESC 
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    console.error('Errore Top20:', err);
    res.status(500).json({ message: 'Errore nel recupero della top 20' });
  }
});

// 📚 GET Archivio musicale
app.get('/api/archivio-musicale', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM raccolta_canzoni ORDER BY artista ASC');
    res.json(rows);
  } catch (err) {
    console.error('Errore archivio musicale:', err);
    res.status(500).json({ message: 'Errore nel recupero dell\'archivio musicale' });
  }
});

// 🥇 GET Classifica
app.get('/api/classifica', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM classifica ORDER BY punteggio DESC');
    res.json(rows);
  } catch (err) {
    console.error('Errore classifica:', err);
    res.status(500).json({ message: 'Errore nel recupero della classifica' });
  }
});

// 🛠️ Opzionale: Crea colonna numero_richieste se non esiste
(async () => {
  try {
    const [result] = await db.query("SHOW COLUMNS FROM canzoni LIKE 'numero_richieste'");
    if (result.length === 0) {
      await db.query("ALTER TABLE canzoni ADD COLUMN numero_richieste INT DEFAULT 0");
      console.log("✅ Colonna 'numero_richieste' creata.");
    }
  } catch (e) {
    console.error("❌ Errore durante il check/creazione della colonna numero_richieste:", e);
  }
})();

// Avvia il server
app.listen(PORT, () => {
  console.log(`🚀 Server attivo su http://localhost:${PORT}`);
});
