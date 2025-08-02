const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;  
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


/* funzione di formattazione dati. Normalizza stringhe nelle post per:
    rimuovere la parola "the" isolata (case-insensitive)
    rimuovere apostrofi e accenti
    fare il trim degli spazi oltre ' '
    capitalizza ogni parola con prima lettera maiuscola e resto minuscolo
*/
function normalizeSongName(name) {
  if (!name) return name;

  let result = name.replace(/\bthe\b/gi, '');
  result = result.replace(/['’`"]/g, '');
  result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  result = result.replace(/\s+/g, ' ').trim();
  result = result
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return result;
}


//middleware per permettere partecipazione solo a user, admin, guest
function optionalVerifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return next();  // guest
  }

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return next();
    }
    req.user = user;
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Non autenticato' });
    if (!allowedRoles.includes(req.user.ruolo)) {
      return res.status(403).json({ message: 'Accesso negato: ruolo non autorizzato' });
    }
    next();
  };
}

app.post('/api/admin/aggiungi-canzone', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { nome, artista, canzone, tonalita } = req.body;

  if (!nome || !artista || !canzone) {
    return res.status(400).json({ message: 'Campi obbligatori mancanti' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO canzoni (nome, artista, canzone, tonalita, posizione) 
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(posizione), 0) + 1 FROM canzoni))`,
      [nome, artista, canzone, tonalita || null]
    );

    res.status(201).json({ message: 'Canzone aggiunta con successo', id: result.insertId });
  } catch (err) {
    console.error('Errore aggiunta canzone:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});


/*app.post('/wishlist', async (req, res) => {
  const { user_id, artista, canzone, tonalita } = req.body;
  if (!user_id || !artista || !canzone) {
    return res.status(400).json({ message: 'Dati mancanti' });
  }

  try {
    await db.query(`
      INSERT INTO wishlist (user_id, artista, canzone, tonalita)
      VALUES (?, ?, ?, ?)
    `, [user_id, artista, canzone, tonalita]);

    res.status(201).json({ message: 'Canzone aggiunta alla wishlist ✅' });
  } catch (err) {
    console.error('Errore salvataggio wishlist:', err);
    res.status(500).json({ message: 'Errore interno' });
  }
});*/



// chiamate per privacy component
app.get('/api/user/profile', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await db.query(
      'SELECT username, ruolo, domanda_recupero FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Utente non trovato' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Errore in GET /api/user/profile:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

//cambio password by vecchia password
app.post('/api/user/change-password/by-old', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { vecchiaPassword, nuovaPassword } = req.body;

  if (!vecchiaPassword || !nuovaPassword) {
    return res.status(400).json({ message: 'Campi obbligatori mancanti' });
  }

  try {
    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Utente non trovato' });

    const passwordOk = await bcrypt.compare(vecchiaPassword, rows[0].password_hash);
    if (!passwordOk) return res.status(401).json({ message: 'Vecchia password errata' });

    const nuovaPasswordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [nuovaPasswordHash, userId]);

    res.json({ message: 'Password cambiata con successo' });
  } catch (err) {
    console.error('Errore in POST /api/user/change-password/by-old:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});


//cambio password by risposta segreta
app.post('/api/user/change-password/by-secret', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { risposta, nuovaPassword } = req.body;

  if (!risposta || !nuovaPassword) {
    return res.status(400).json({ message: 'Campi obbligatori mancanti' });
  }

  try {
    const [rows] = await db.query('SELECT risposta_recupero_hash FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Utente non trovato' });

    const rispostaOk = await bcrypt.compare(risposta, rows[0].risposta_recupero_hash);
    if (!rispostaOk) return res.status(401).json({ message: 'Risposta segreta errata' });

    const nuovaPasswordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [nuovaPasswordHash, userId]);

    res.json({ message: 'Password cambiata con successo' });
  } catch (err) {
    console.error('Errore in POST /api/user/change-password/by-secret:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});



const leoProfanity = require('leo-profanity');
leoProfanity.add(leoProfanity.getDictionary('en'));
leoProfanity.add(leoProfanity.getDictionary('it'));
const customBadWords = require('./utils/profanityList');
// Aggiungo le parole personalizzate dalla lista esterna
leoProfanity.add(customBadWords);

app.post('/api/canzoni/:id/aggiungi-partecipante', optionalVerifyToken, async (req, res) => {
  console.log('=== Debug POST aggiungi partecipante ===');
  console.log('Authorization header:', req.headers.authorization);
  console.log('Decoded user from token:', req.user);

  const canzoneId = req.params.id;
  let { nomePartecipante, guestId } = req.body;

  if (!nomePartecipante) {
    return res.status(400).json({ message: 'Nome partecipante obbligatorio.' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Devi essere loggato per partecipare.' });
  }

  // Censura eventuali parolacce nel nome partecipante
  nomePartecipante = leoProfanity.clean(nomePartecipante);

  const userId = req.user.id;
  const now = new Date();

  try {
    // Prendo la canzone e l'esibizione associata con JOIN
    const [result] = await db.query(
      `SELECT c.*, e.id AS esibizione_id
       FROM canzoni c
       LEFT JOIN user_storico_esibizioni e ON c.id = e.esibizione_id
       WHERE c.id = ?`,
      [canzoneId]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: 'Canzone non trovata' });
    }

    const canzone = result[0];
    console.log('[DEBUG] Canzone trovata con esibizione:', canzone);

    let partecipante2 = canzone.partecipante_2;
    let partecipante3 = canzone.partecipante_3;

    if (!partecipante2) {
      partecipante2 = nomePartecipante;
      await db.query('UPDATE canzoni SET partecipante_2 = ? WHERE id = ?', [nomePartecipante, canzoneId]);
    } else if (!partecipante3) {
      partecipante3 = nomePartecipante;
      await db.query('UPDATE canzoni SET partecipante_3 = ? WHERE id = ?', [nomePartecipante, canzoneId]);
    } else {
      return res.status(400).json({ message: 'Numero massimo di partecipanti raggiunto per questa canzone.' });
    }

    await db.query(
      `INSERT INTO user_storico_esibizioni (
        user_id, canzone_id, esibizione_id, data_esibizione, tonalita,
        nome, artista, canzone, partecipante_2, partecipante_3
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        canzoneId,
        canzone.esibizione_id,
        now,
        canzone.tonalita || null,
        canzone.nome,
        canzone.artista,
        canzone.canzone,
        partecipante2,
        partecipante3
      ]
    );

    console.log('[DEBUG] Partecipazione registrata con successo.');
    return res.json({ message: 'Partecipazione registrata con successo.' });

  } catch (error) {
    console.error('[ERRORE] POST partecipazione:', error);
    return res.status(500).json({ message: 'Errore interno del server.' });
  }
});


// get nomi partecipanti per user-canzoni component
app.get('/api/esibizioni/user/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    // Recupera tutte le esibizioni di quell'utente
    const [esibizioni] = await db.query(
      `SELECT 
         id, 
         esibizione_id, 
         nome, 
         artista, 
         canzone, 
         tonalita, 
         data_esibizione, 
         partecipante_2, 
         partecipante_3
       FROM user_storico_esibizioni
       WHERE user_id = ?
       ORDER BY data_esibizione DESC`,
      [userId]
    );

    if (esibizioni.length === 0) {
      return res.json([]);
    }

    // Estrai gli id esibizione per la query successiva sui voti
    const esibizioneIds = esibizioni.map(e => e.esibizione_id).filter(id => id != null);

    if (esibizioneIds.length === 0) {
      // Nessun esibizione con id valido, aggiungi voti vuoti e ritorna
      esibizioni.forEach(e => e.voti = []);
      return res.json(esibizioni);
    }

    // Recupera i voti per tutte le esibizioni dell'utente
    const [voti] = await db.query(
      `SELECT esibizione_id, emoji, COUNT(*) AS count
       FROM voti_emoji
       WHERE esibizione_id IN (${esibizioneIds.map(() => '?').join(',')})
       GROUP BY esibizione_id, emoji`,
      esibizioneIds
    );

    // Mappa i voti per ogni esibizione
    const votiPerEsibizione = {};
    voti.forEach(v => {
      if (!votiPerEsibizione[v.esibizione_id]) votiPerEsibizione[v.esibizione_id] = [];
      votiPerEsibizione[v.esibizione_id].push({ emoji: v.emoji, count: v.count });
    });

    // Aggiungi i voti a ogni esibizione
    esibizioni.forEach(e => {
      e.voti = votiPerEsibizione[e.esibizione_id] || [];
    });

    res.json(esibizioni);

  } catch (err) {
    console.error('Errore recupero esibizioni:', err);
    res.status(500).json({ message: 'Errore nel recupero delle esibizioni' });
  }
});




// salva in tabella voti_emoji i like
app.post('/api/voti', async (req, res) => {
  const { canzone_id, voter_id, emoji } = req.body;
  const esibizione_id = canzone_id;

  if (!esibizione_id || !voter_id || !emoji) {
    return res.status(400).json({ message: 'Parametri mancanti o errati' });
  }

  try {
    const [existingVote] = await db.query(
      'SELECT * FROM voti_emoji WHERE esibizione_id = ? AND voter_id = ?',
      [esibizione_id, voter_id]
    );

    if (existingVote.length > 0) {
      const votoId = existingVote[0].id;
      await db.query(
        'UPDATE voti_emoji SET emoji = ?, data_esibizione = CURRENT_TIMESTAMP WHERE id = ?',
        [emoji, votoId]
      );
      return res.json({ message: 'Voto aggiornato' });
    } else {
      await db.query(
        'INSERT INTO voti_emoji (esibizione_id, voter_id, emoji) VALUES (?, ?, ?)',
        [esibizione_id, voter_id, emoji]
      );
      return res.json({ message: 'Voto registrato' });
    }
  } catch (err) {
    console.error('Errore API voti:', err.sqlMessage || err.message || err);
    return res.status(500).json({ message: 'Errore interno del server' });
  }
});




const mapDomande = {
  nome_animale_domestico: "Qual è il nome del tuo animale domestico?",
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


// invio dati e verifiche per login
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

// genera token per log con refresh
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


// genera logout
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


// registra dati user creando un account
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

//function per admin per modificare ordine canzoni in lista-canzoni component by drag
app.post('/api/canzoni/riordina', async (req, res) => {
  const nuovaLista = req.body; // [{ id: 1, posizione: 1 }, { id: 2, posizione: 2 }, ...]

  if (!Array.isArray(nuovaLista)) {
    return res.status(400).json({ message: 'Formato dati non valido' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const canzone of nuovaLista) {
      await conn.query('UPDATE canzoni SET posizione = ? WHERE id = ?', [canzone.posizione, canzone.id]);
    }

    await conn.commit();
    res.json({ message: 'Riordinamento completato con successo' });
  } catch (err) {
    await conn.rollback();
    console.error('Errore nel riordinamento:', err.message || err);
    res.status(500).json({ message: 'Errore durante il riordinamento' });
  } finally {
    conn.release();
  }
});


//genera lista classica topN
app.get('/api/classifica/top', async (req, res) => {
  const n = parseInt(req.query.n) || 30; // default top30
  try {
    const [rows] = await db.query(
      `SELECT id, artista, canzone, num_richieste FROM classifica ORDER BY num_richieste DESC LIMIT ?`,
      [n]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero della classifica' });
  }
});

// DELETE canzone da classifica (solo admin)
app.delete('/api/classifica/:id', verifyToken, async (req, res) => {
  if (req.user.ruolo !== 'admin') {
    return res.status(403).json({ message: 'Accesso negato: solo admin può eliminare' });
  }

  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM classifica WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Canzone non trovata in classifica' });
    }
    res.json({ message: 'Canzone eliminata dalla classifica con successo' });
  } catch (err) {
    console.error('Errore durante DELETE classifica:', err);
    res.status(500).json({ message: 'Errore interno server' });
  }
});


app.post('/api/canzoni', async (req, res) => {
  let { nome, artista, canzone, tonalita, note, user_id, guest_id, accetta_partecipanti } = req.body;

  if (!user_id && !guest_id) {
    return res.status(400).json({ message: 'user_id o guest_id obbligatorio' });
  }

  // Censuro il campo 'nome'
  nome = leoProfanity.clean(nome);

   if (note) {
    note = leoProfanity.clean(note);
  }
  
  // Normalizzo i dati (puoi decidere se fare anche su artista e canzone)
  artista = normalizeSongName(artista);
  canzone = normalizeSongName(canzone);

  try {
    // Calcolo la posizione massima attuale
    const [maxPosResult] = await db.query('SELECT MAX(posizione) AS maxPos FROM canzoni');
    const maxPos = maxPosResult[0].maxPos || 0;
    const nuovaPosizione = maxPos + 1;

    // Inserisco nella tabella canzoni
    const [result] = await db.query(
      `INSERT INTO canzoni 
       (nome, artista, canzone, tonalita, note, user_id, guest_id, accetta_partecipanti, posizione) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, artista, canzone, tonalita, note, user_id || null, guest_id || null, accetta_partecipanti ? 1 : 0, nuovaPosizione]
    );

    const canzoneId = result.insertId;

    // Se utente registrato, aggiorno user_storico_esibizioni
    if (user_id) {
      await db.query(
        `INSERT INTO user_storico_esibizioni 
         (user_id, esibizione_id, canzone_id, tonalita, nome, artista, canzone, data_esibizione) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [user_id, canzoneId, canzoneId, tonalita || null, nome, artista, canzone]
      );
    }

    // Aggiorno raccolta_canzoni
    await db.query(
      `INSERT INTO raccolta_canzoni (artista, canzone, num_richieste)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE num_richieste = num_richieste + 1`,
      [artista, canzone]
    );

    // Aggiorno classifica
    await db.query(
      `INSERT INTO classifica (artista, canzone, num_richieste)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE num_richieste = num_richieste + 1`,
      [artista, canzone]
    );

    res.json({ 
      message: 'Canzone aggiunta e storico + classifica aggiornati con successo',
      canzoneId,
      posizione: nuovaPosizione
    });
  } catch (err) {
    console.error('Errore in POST /api/canzoni:', err);
    res.status(500).json({ message: 'Errore durante l\'aggiunta' });
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


// Ottieni tutta la wishlist (potresti aggiungere filtro per userId se vuoi)
app.get('/api/wishlist', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query('SELECT * FROM wishlist WHERE user_id = ?', [userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore nel recupero wishlist' });
  }
});

// Aggiungi una canzone alla wishlist
app.post('/api/wishlist', verifyToken, async (req, res) => {
  const { canzone, artista, tonalita } = req.body;
  const userId = req.user.id;

  if (!canzone || !artista) {
    return res.status(400).json({ message: 'Canzone e artista sono obbligatori' });
  }

  try {
    await db.query('INSERT INTO wishlist (canzone, artista, tonalita, user_id) VALUES (?, ?, ?, ?)', [canzone, artista, tonalita || null, userId]);
    res.json({ message: 'Canzone aggiunta alla wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore durante l\'aggiunta alla wishlist' });
  }
});

// Elimina una canzone dalla wishlist
app.delete('/api/wishlist/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [rows] = await db.query('DELETE FROM wishlist WHERE id = ? AND user_id = ?', [id, userId]);
    if (rows.affectedRows === 0) {
      return res.status(404).json({ message: 'Canzone non trovata o non autorizzato' });
    }
    res.json({ message: 'Canzone rimossa dalla wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore durante la rimozione' });
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

app.delete('/api/archivio-musicale/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  // Controllo ruolo admin
  if (req.user.ruolo !== 'admin') {
    return res.status(403).json({ message: 'Accesso negato: solo admin può eliminare' });
  }

  try {
    const [result] = await db.query('DELETE FROM raccolta_canzoni WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Canzone non trovata nell\'archivio' });
    }

    res.json({ message: 'Canzone eliminata dall\'archivio con successo' });
  } catch (err) {
    console.error('Errore durante la DELETE da archivio musicale:', err);
    res.status(500).json({ message: 'Errore durante l\'eliminazione' });
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
