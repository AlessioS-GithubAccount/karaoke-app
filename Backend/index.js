const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;
const db = require('./database');

app.use(cors());
app.use(express.json()); // per leggere JSON dal body

// Rotta GET di cortesia per la homepage
app.get('/', (req, res) => {
  res.send('✅ API Karaoke attiva! Puoi inviare dati a /api/canzoni');
});

// Endpoint POST per ricevere dati canzone e salvarli nel DB
app.post('/api/canzoni', (req, res) => {
  const { nome, artista, canzone, tonalita, note } = req.body;
  console.log('🎵 Dati ricevuti:', req.body);

  const sql = 'INSERT INTO canzoni (nome, artista, canzone, tonalita, note) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [nome, artista, canzone, tonalita, note], (err, result) => {
    if (err) {
      console.error('Errore durante inserimento dati:', err);
      return res.status(500).json({ message: 'Errore interno del server' });
    }
    console.log('Dati salvati nel DB, ID:', result.insertId);
    res.status(201).json({ message: 'Canzone salvata con successo!', id: result.insertId });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server backend attivo su http://localhost:${PORT}`);
});
