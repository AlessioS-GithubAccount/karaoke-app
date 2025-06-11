const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Rotta base per testare che il server sia attivo
app.get('/', (req, res) => {
  res.send('✅ API Karaoke attiva! Puoi inviare e recuperare dati a /api/canzoni');
});

// Rotta POST per aggiungere una nuova canzone
app.post('/api/canzoni', (req, res) => {
  const { nome, artista, canzone, tonalita, note } = req.body;

  if (!nome || !artista || !canzone) {
    return res.status(400).json({ message: 'nome, artista e canzone sono obbligatori' });
  }

  const query = 'INSERT INTO canzoni (nome, artista, canzone, tonalita, note) VALUES (?, ?, ?, ?, ?)';
  const values = [nome, artista, canzone, tonalita, note];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Errore inserimento dati:', err);
      return res.status(500).json({ message: 'Errore nel salvataggio' });
    }

    res.status(201).json({ message: 'Canzone salvata con successo', id: result.insertId });
  });
});

// Rotta GET per recuperare tutte le canzoni
app.get('/api/canzoni', (req, res) => {
  const query = 'SELECT * FROM canzoni';

  db.query(query, (err, results) => {
    if (err) {
      console.error('Errore nel recupero delle canzoni:', err);
      return res.status(500).json({ message: 'Errore nel recupero delle canzoni' });
    }

    res.status(200).json(results);
  });
});

// Avvio del server
app.listen(PORT, () => {
  console.log(`🚀 Server backend attivo su http://localhost:${PORT}`);
});
