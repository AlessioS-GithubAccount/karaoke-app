const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ API Karaoke attiva! Puoi inviare e recuperare dati a /api/canzoni');
});

// POST: inserisce in `canzoni` e `raccolta_canzoni`
app.post('/api/canzoni', (req, res) => {
  const { nome, artista, canzone, tonalita, note } = req.body;

  if (!nome || !artista || !canzone) {
    return res.status(400).json({ message: 'nome, artista e canzone sono obbligatori' });
  }

  const values = [nome, artista, canzone, tonalita || null, note || null];

  const insertCanzoni = 'INSERT INTO canzoni (nome, artista, canzone, tonalita, note) VALUES (?, ?, ?, ?, ?)';
  const insertRaccolta = 'INSERT INTO raccolta_canzoni (nome, artista, canzone, tonalita, note) VALUES (?, ?, ?, ?, ?)';

  db.query(insertCanzoni, values, (err1, result1) => {
    if (err1) {
      console.error('Errore inserimento in canzoni:', err1);
      return res.status(500).json({ message: 'Errore salvataggio canzoni' });
    }

    db.query(insertRaccolta, values, (err2) => {
      if (err2) {
        console.error('Errore inserimento in raccolta:', err2);
        return res.status(500).json({ message: 'Errore salvataggio raccolta' });
      }

      res.status(201).json({ message: 'Canzone salvata con successo', id: result1.insertId });
    });
  });
});

// GET tutte le canzoni
app.get('/api/canzoni', (req, res) => {
  db.query('SELECT * FROM canzoni ORDER BY id DESC', (err, results) => {
    if (err) {
      console.error('Errore nel recupero delle canzoni:', err);
      return res.status(500).json({ message: 'Errore nel recupero delle canzoni' });
    }
    res.status(200).json(results);
  });
});

// RESET canzoni (solo per admin, password semplice)
app.post('/api/reset-canzoni', (req, res) => {
  const { password } = req.body;

  if (password !== 'admin123') {
    return res.status(401).json({ message: 'Password errata. Accesso negato.' });
  }

  db.query('DELETE FROM canzoni', (err) => {
    if (err) {
      console.error('Errore durante il reset:', err);
      return res.status(500).json({ message: 'Errore durante il reset' });
    }

    res.status(200).json({ message: 'Tabella canzoni resettata con successo' });
  });
});

// GET top 20 più richieste nella raccolta
app.get('/api/top20', (req, res) => {
  const query = `
    SELECT canzone, artista, COUNT(*) AS richieste
    FROM raccolta_canzoni
    GROUP BY canzone, artista
    ORDER BY richieste DESC
    LIMIT 20
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Errore nel recupero top 20:', err);
      return res.status(500).json({ message: 'Errore recupero top20' });
    }

    res.status(200).json(results);
  });
});

// Avvio server
app.listen(PORT, () => {
  console.log(`🚀 Server backend attivo su http://localhost:${PORT}`);
});
