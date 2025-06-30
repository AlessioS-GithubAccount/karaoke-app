const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'karaoke_super_segreto';
const REFRESH_SECRET = 'karaoke_refresh_secret';
const PIN_ADMIN = '0000';

let refreshTokens = [];

app.use(cors());
app.use(express.json());

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Token mancante' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token non valido' });
  }
}

app.post('/api/voti', async (req, res) => {
  /*
    Body atteso:
    {
      esibizione_id: number,
      voter_id: number, // obbligatorio, utente loggato
      emoji: string
    }
  */
  const { canzone_id, voter_id, emoji } = req.body;
  const esibizione_id = canzone_id; // per retrocompatibilità, se vuoi

  if (!esibizione_id || !voter_id || !emoji) {
    return res.status(400).json({ message: 'Parametri mancanti o errati' });
  }

  try {
    // Verifica se l'utente ha già votato questa esibizione
    const [existingVote] = await db.query(
      'SELECT * FROM voti_emoji WHERE esibizione_id = ? AND voter_id = ?',
      [esibizione_id, voter_id]
    );

    if (existingVote.length > 0) {
      // Aggiorna voto esistente
      const votoId = existingVote[0].id;
      await db.query('UPDATE voti_emoji SET emoji = ?, data_voto = CURRENT_TIMESTAMP WHERE id = ?', [emoji, votoId]);
      return res.json({ message: 'Voto aggiornato' });
    } else {
      // Inserisci nuovo voto
      await db.query(
        'INSERT INTO voti_emoji (esibizione_id, voter_id, emoji) VALUES (?, ?, ?)',
        [esibizione_id, voter_id, emoji]
      );
      return res.json({ message: 'Voto registrato' });
    }
  } catch (err) {
    console.error('Errore API voti:', err);
    return res.status(500).json({ message: 'Errore interno del server' });
  }
});



const mapDomande = {
  nome_primo_amicizia: "Qual è il nome del tuo animale domestico?",
  "città_preferita": "Qual è la tua città preferita?",
  nome_madre: "Qual è il nome di tua madre/padre?",
  animale_preferito: "Qual è il tuo animale preferito?",
  codicepin: "Crea il tuo codice PIN di recupero"
};


app.get('/api/auth/forgot-password/question/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const [rows] = await db.query('SELECT domanda_recupero FROM users WHERE username = ?', [username]);
    console.log('Query result:', rows);
    if (rows.length === 0) return res.status(404).json({ message: 'Utente non trovato' });

    const keyDomanda = rows[0].domanda_recupero;
    if (!keyDomanda) return res.status(404).json({ message: 'Domanda segreta assente per questo utente' });

    const domanda = mapDomande[keyDomanda] || keyDomanda;

    res.json({ domanda });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});



// 2) Verifica risposta e consente reset password
app.post('/api/auth/forgot-password/verify', async (req, res) => {
  const { username, risposta } = req.body;

  if (!username || !risposta) {
    return res.status(400).json({ valid: false, message: 'Campi mancanti' });
  }

  try {
    const [rows] = await db.query('SELECT risposta_recupero_hash FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(404).json({ valid: false, message: 'Utente non trovato' });

    const rispostaHash = rows[0].risposta_recupero_hash;
    const rispostaOk = await bcrypt.compare(risposta, rispostaHash);

    res.json({ valid: rispostaOk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false, message: 'Errore interno del server' });
  }
});

// ✅ RESET della password dopo verifica risposta segreta
app.post('/api/auth/forgot-password/reset', async (req, res) => {
  const { username, nuovaPassword } = req.body;

  if (!username || !nuovaPassword) {
    return res.status(400).json({ message: 'Campi obbligatori mancanti' });
  }

  try {
    const nuovaPasswordHash = await bcrypt.hash(nuovaPassword, 10);
    const [result] = await db.query('UPDATE users SET password_hash = ? WHERE username = ?', [nuovaPasswordHash, username]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    res.json({ message: 'Password aggiornata con successo' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore durante il reset della password' });
  }
});



app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt for:', username);
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    console.log('User rows:', rows);
    if (rows.length === 0) return res.status(401).json({ message: 'Credenziali non valide' });

    const user = rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    console.log('Password match:', passwordOk);
    if (!passwordOk) return res.status(401).json({ message: 'Credenziali non valide' });

    await db.query('UPDATE users SET online_status = 1 WHERE id = ?', [user.id]);

    const token = jwt.sign({ id: user.id, username: user.username, ruolo: user.ruolo }, SECRET_KEY, { expiresIn: '2h' });
    const refreshToken = jwt.sign({ id: user.id, username: user.username, ruolo: user.ruolo }, REFRESH_SECRET, { expiresIn: '7d' });

    refreshTokens.push(refreshToken);

    res.json({ message: 'Login riuscito', token, refreshToken, ruolo: user.ruolo });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

app.post('/api/auth/token', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ message: 'Refresh token non valido' });
  }

  try {
    const user = jwt.verify(refreshToken, REFRESH_SECRET);
    const newAccessToken = jwt.sign({ id: user.id, username: user.username, ruolo: user.ruolo }, SECRET_KEY, { expiresIn: '2h' });
    res.json({ token: newAccessToken });
  } catch (err) {
    return res.status(403).json({ message: 'Token non valido' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const { username, refreshToken } = req.body;
  try {
    refreshTokens = refreshTokens.filter(token => token !== refreshToken);
    await db.query('UPDATE users SET online_status = 0 WHERE username = ?', [username]);
    res.json({ message: 'Logout effettuato' });
  } catch (err) {
    res.status(500).json({ message: 'Errore durante il logout' });
  }
});


app.post('/api/auth/register', async (req, res) => {
  const { username, password, domandaRecupero, rispostaRecupero, keypass } = req.body;
  if (!username || !password || !domandaRecupero || !rispostaRecupero) {
    return res.status(400).json({ message: 'Campi obbligatori mancanti' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) return res.status(409).json({ message: 'Username già in uso' });

    const password_hash = await bcrypt.hash(password, 10);
    const risposta_hash = await bcrypt.hash(rispostaRecupero, 10);
    const ruolo = keypass === PIN_ADMIN ? 'admin' : 'client';

    await db.query(
      `INSERT INTO users (username, password_hash, domanda_recupero, risposta_recupero_hash, ruolo) VALUES (?, ?, ?, ?, ?)`,
      [username, password_hash, domandaRecupero, risposta_hash, ruolo]
    );

    res.status(201).json({ message: `Utente creato con ruolo ${ruolo}` });
  } catch (err) {
    res.status(500).json({ message: 'Errore durante la registrazione' });
  }
});


app.get('/api/users/by-username/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const [rows] = await db.query('SELECT id, username, ruolo, online_status, created_at FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(404).json({ message: 'Utente non trovato' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero utente' });
  }
});



app.get('/api/canzoni', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM canzoni ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero delle canzoni' });
  }
});

app.post('/api/canzoni', async (req, res) => {
  const { nome, artista, canzone, tonalita, note, user_id, accetta_partecipanti } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'user_id obbligatorio' });
  }

  try {
    // 1. Inserisce nella tabella `canzoni`
    const [result] = await db.query(
      'INSERT INTO canzoni (nome, artista, canzone, tonalita, note, user_id, guest_id, accetta_partecipanti) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
      [nome, artista, canzone, tonalita, note, user_id, accetta_partecipanti ? 1 : 0]
    );

    const canzoneId = result.insertId;

    // 2. Inserisce nella `raccolta_canzoni` solo se non già presente
    await db.query(
      `INSERT INTO raccolta_canzoni (artista, canzone, user_id)
       SELECT * FROM (SELECT ? AS artista, ? AS canzone, ? AS user_id) AS tmp
       WHERE NOT EXISTS (
         SELECT 1 FROM raccolta_canzoni WHERE artista = ? AND canzone = ?
       )`, [artista, canzone, user_id, artista, canzone]
    );

    // 3. Inserisce in `user_storico_esibizioni` duplicando i dati (no join futura necessaria)
    await db.query(
      'INSERT INTO user_storico_esibizioni (user_id, canzone_id, tonalita, nome, artista, canzone) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, canzoneId, tonalita || null, nome, artista, canzone]
    );

    res.json({ message: 'Canzone aggiunta e storico aggiornato con successo' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore durante l\'aggiunta' });
  }
});

app.get('/api/esibizioni/user/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT id AS esibizione_id, nome, artista, canzone, tonalita, data_esibizione
       FROM user_storico_esibizioni
       WHERE user_id = ?
       ORDER BY data_esibizione DESC`,
      [userId]
    );

    /* Se vuoi aggiungere i voti emoji qui, puoi aggiungere un ciclo async (opzionale)
       per ogni esibizione, ma attenzione alle performance */

    res.json(rows);
  } catch (err) {
    console.error('❌ Errore nel recupero delle esibizioni:', err.message, err);
    res.status(500).json({ message: 'Errore nel recupero delle esibizioni' });
  }
});


app.get('/api/esibizioni/:esibizioneId/voti', async (req, res) => {
  const esibizioneId = req.params.esibizioneId;

  try {
    const [voti] = await db.query(
      `SELECT emoji, COUNT(*) AS count
       FROM voti_emoji
       WHERE esibizione_id = ?
       GROUP BY emoji`,
      [esibizioneId]
    );

    // Se non ci sono voti, ritorna array vuoto
    res.json(voti || []);
  } catch (err) {
    console.error('Errore recupero voti:', err);
    res.status(500).json({ message: 'Errore nel recupero dei voti' });
  }
});



app.put('/api/canzoni/:id/cantata', async (req, res) => {
  const { id } = req.params;
  const { cantata } = req.body;
  try {
    await db.query('UPDATE canzoni SET cantata = ? WHERE id = ?', [cantata, id]);
    res.json({ message: 'Stato cantata aggiornato' });
  } catch (err) {
    res.status(500).json({ message: 'Errore aggiornamento' });
  }
});

app.put('/api/canzoni/:id/partecipa', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE canzoni SET partecipanti_add = partecipanti_add + 1, numero_richieste = numero_richieste + 1 WHERE id = ?', [id]);
    const [updated] = await db.query('SELECT partecipanti_add FROM canzoni WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ message: 'Errore durante la partecipazione' });
  }
});

app.get('/api/canzoni/:id/nome-partecipante', async (req, res) => {
  const { id } = req.params;
  try {
    const [row] = await db.query('SELECT nome FROM canzoni WHERE id = ?', [id]);
    res.json({ nome: row[0]?.nome || 'Anonimo' });
  } catch (err) {
    res.status(500).json({ message: 'Errore durante recupero nome' });
  }
});

app.post('/api/reset-canzoni', async (req, res) => {
  const { password } = req.body;
  if (password !== 'karaokeadmin') {
    return res.status(401).json({ message: 'Password errata' });
  }

  try {
    await db.query('UPDATE canzoni SET cantata = 0, partecipanti_add = 0');
    res.json({ message: 'Lista resettata' });
  } catch (err) {
    res.status(500).json({ message: 'Errore durante il reset' });
  }
});

app.get('/api/top20', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT canzone, artista, numero_richieste FROM canzoni ORDER BY numero_richieste DESC LIMIT 20');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero della top 20' });
  }
});

app.get('/api/archivio-musicale', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM raccolta_canzoni ORDER BY artista ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nell\'archivio musicale' });
  }
});

app.get('/api/classifica', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM classifica ORDER BY punteggio DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero della classifica' });
  }
});

app.put('/api/canzoni/:id', verifyToken, async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { nome, artista, canzone, tonalita, note, accetta_partecipanti } = req.body;

  try {
    const [rows] = await db.query('SELECT user_id FROM canzoni WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Canzone non trovata' });

    const canzoneTrovata = rows[0];
    if (user.ruolo !== 'admin' && user.id !== canzoneTrovata.user_id) {
      return res.status(403).json({ message: 'Non autorizzato a modificare questa canzone' });
    }

    await db.query(
      `UPDATE canzoni 
       SET nome = ?, artista = ?, canzone = ?, tonalita = ?, note = ?, accetta_partecipanti = ? 
       WHERE id = ?`,
      [nome, artista, canzone, tonalita, note, accetta_partecipanti ? 1 : 0, id]
    );

    res.json({ message: 'Canzone aggiornata con successo' });
  } catch (err) {
    res.status(500).json({ message: 'Errore aggiornamento canzone' });
  }
});

app.delete('/api/canzoni/:id', verifyToken, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const [rows] = await db.query('SELECT user_id FROM canzoni WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Canzone non trovata' });

    const canzone = rows[0];
    if (user.ruolo !== 'admin' && user.id !== canzone.user_id) {
      return res.status(403).json({ message: 'Non autorizzato a eliminare questa canzone' });
    }

    await db.query('DELETE FROM canzoni WHERE id = ?', [id]);
    res.json({ message: 'Canzone eliminata con successo' });
  } catch (err) {
    console.error('Errore in DELETE /api/canzoni/:id', err); // aggiungi questo
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

app.delete('/api/esibizioni/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query('DELETE FROM user_storico_esibizioni WHERE id = ?', [id]);

    if (rows.affectedRows === 0) {
      return res.status(404).json({ message: 'Esibizione non trovata' });
    }

    res.json({ message: 'Esibizione eliminata con successo' });
  } catch (err) {
    console.error('Errore eliminazione esibizione:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});




(async () => {
  try {
    const [resultNum] = await db.query("SHOW COLUMNS FROM canzoni LIKE 'numero_richieste'");
    if (resultNum.length === 0) {
      await db.query("ALTER TABLE canzoni ADD COLUMN numero_richieste INT DEFAULT 0");
      console.log("✅ Colonna 'numero_richieste' creata.");
    }
    const [resultAcc] = await db.query("SHOW COLUMNS FROM canzoni LIKE 'accetta_partecipanti'");
    if (resultAcc.length === 0) {
      await db.query("ALTER TABLE canzoni ADD COLUMN accetta_partecipanti TINYINT(1) DEFAULT 0");
      console.log("✅ Colonna 'accetta_partecipanti' creata.");
    }
  } catch (e) {
    console.error("❌ Errore creazione colonne:", e);
  }
})();

app.listen(PORT, () => {
  console.log(`🚀 Server attivo su http://localhost:${PORT}`);
});
