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

// Endpoint POST per ricevere dati canzone
app.post('/api/canzoni', (req, res) => {
  const dati = req.body;
  console.log('🎵 Dati ricevuti:', dati);
  
  // Qui puoi salvare i dati nel DB o altro
  res.status(201).json({ message: 'Dati ricevuti con successo', dati });
});

app.listen(PORT, () => {
  console.log(`🚀 Server backend attivo su http://localhost:${PORT}`);
});
