require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db/pool');

// === Socket.IO / HTTP
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const app = express();

// ====== CORS ======
// Legge da env var (CSV). Se non c'è, fallback a Netlify + localhost.
const allowedOrigins =
  (process.env.CORS_ORIGINS &&
    process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)) ||
  ['https://karaoke-webapp0.netlify.app', 'http://localhost:4200'];

// CORS PRIMA delle rotte
app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-snapshot-key'],
    maxAge: 600, // cache preflight 10 min
  })
);

// Risposte immediate alle preflight
app.options('*', cors());

// Body parser JSON
app.use(express.json());

// ====== CONFIG / SECRETS ======
const PORT = process.env.PORT || 3000;

// 🔐 Spostati su .env (con fallback di sviluppo)
const SECRET_KEY = process.env.SECRET_KEY || 'dev_secret_change_me';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'dev_refresh_change_me';

const PIN_ADMIN = '0000';
const SNAPSHOT_KEY = process.env.SNAPSHOT_KEY;

let refreshTokens = [];


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


//inizializzazione leoProfanity
const leoProfanity = require('leo-profanity');
leoProfanity.add(leoProfanity.getDictionary('en'));
leoProfanity.add(leoProfanity.getDictionary('it'));
const customBadWords = require('./utils/profanityList');
// Aggiungo le parole personalizzate dalla lista esterna
leoProfanity.add(customBadWords);

//func per aggiungere partecipante a un esibizione
app.post('/api/canzoni/:id/aggiungi-partecipante', optionalVerifyToken, async (req, res) => {
  const canzoneId = Number(req.params.id);
  let { nomePartecipante } = req.body;

  if (!nomePartecipante) {
    return res.status(400).json({ message: 'Nome partecipante obbligatorio.' });
  }
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Devi essere loggato per partecipare.' });
  }

  // Censura
  nomePartecipante = leoProfanity.clean(nomePartecipante);

  const userId = req.user.id;
  const now = new Date();

  try {
    // 1) Prendi la canzone (registrante + partecipanti attuali)
    const [rows] = await db.query(
      `SELECT id, user_id, nome AS registrante_nome, artista, canzone, tonalita, partecipante_2, partecipante_3
       FROM canzoni
       WHERE id = ?`,
      [canzoneId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Canzone non trovata' });

    const canzone = rows[0];
    let p2 = canzone.partecipante_2;
    let p3 = canzone.partecipante_3;

    // 2) Assegna lo slot libero nella canzone (p2 -> p3)
    if (!p2) {
      p2 = nomePartecipante;
      await db.query('UPDATE canzoni SET partecipante_2 = ? WHERE id = ?', [nomePartecipante, canzoneId]);
    } else if (!p3) {
      p3 = nomePartecipante;
      await db.query('UPDATE canzoni SET partecipante_3 = ? WHERE id = ?', [nomePartecipante, canzoneId]);
    } else {
      return res.status(400).json({ message: 'Numero massimo di partecipanti raggiunto per questa canzone.' });
    }

    // 3) Aggiorna la riga di STORICO del REGISTRANTE con i partecipanti effettivi
    //    (solo se la canzone è stata registrata da un utente loggato)
    const esibizioneId = canzoneId; // coerente con le altre API
    if (canzone.user_id) {
      await db.query(
        `UPDATE user_storico_esibizioni
         SET partecipante_2 = ?, partecipante_3 = ?
         WHERE user_id = ? AND esibizione_id = ?`,
        [p2 || null, p3 || null, canzone.user_id, esibizioneId]
      );
    }

    // 4) Inserisci la riga di STORICO per il PARTECIPANTE
    //    "hai cantato con" deve mostrare IL REGISTRANTE (sempre),
    //    e, se presente, anche l'altro partecipante diverso da me.
    const norm = s => (s || '').trim().toLowerCase();
    const me = norm(nomePartecipante);
    const registrante = canzone.registrante_nome || null;

    // calcola eventuale "altro partecipante" (quello diverso da me)
    let altro = null;
    if (p2 && norm(p2) !== me) altro = p2;
    if (p3 && norm(p3) !== me) altro = altro ? altro : p3; // prendi il primo diverso da me

    await db.query(
      `INSERT INTO user_storico_esibizioni (
        user_id, canzone_id, esibizione_id, data_esibizione, tonalita,
        nome, artista, canzone, partecipante_2, partecipante_3
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        canzoneId,
        esibizioneId,
        now,
        canzone.tonalita || null,
        canzone.registrante_nome,  // "nome" del registrante (coerente con tuo schema)
        canzone.artista,
        canzone.canzone,
        registrante,               // hai cantato con = registrante
        altro                      // e (se c'è) anche l'altro partecipante ≠ me
      ]
    );

    return res.json({ message: 'Partecipazione registrata con successo.' });

  } catch (error) {
    console.error('[ERRORE] POST aggiungi-partecipante:', error);
    return res.status(500).json({ message: 'Errore interno del server.' });
  }
});

//func per recuperare lo storico canzoni dello user - usercanzoni
app.get('/api/esibizioni/user/:id', async (req, res) => {
  const userId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 8;
  const offset = (page - 1) * pageSize;

  try {
    // Conta tutte le esibizioni dell'utente
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM user_storico_esibizioni WHERE user_id = ?`,
      [userId]
    );

    if (total === 0) {
      return res.json({
        esibizioni: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: page
      });
    }

    const totalPages = Math.ceil(total / pageSize);

    // Recupera solo le esibizioni della pagina richiesta
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
       ORDER BY data_esibizione DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );

    const esibizioneIds = esibizioni.map(e => e.esibizione_id).filter(id => id != null);

    let votiPerEsibizione = {};

    if (esibizioneIds.length > 0) {
      const [voti] = await db.query(
        `SELECT esibizione_id, emoji, COUNT(*) AS count
         FROM voti_emoji
         WHERE esibizione_id IN (${esibizioneIds.map(() => '?').join(',')})
         GROUP BY esibizione_id, emoji`,
        esibizioneIds
      );

      voti.forEach(v => {
        if (!votiPerEsibizione[v.esibizione_id]) votiPerEsibizione[v.esibizione_id] = [];
        votiPerEsibizione[v.esibizione_id].push({ emoji: v.emoji, count: v.count });
      });
    }

    esibizioni.forEach(e => {
      e.voti = votiPerEsibizione[e.esibizione_id] || [];
    });

    res.json({
      esibizioni,
      totalItems: total,
      totalPages,
      currentPage: page
    });

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



//mapping domande di sicurezza e recupero password
const mapDomande = {
  nome_animale_domestico: "Qual è il nome del tuo animale domestico?",
  "città_preferita": "Qual è la tua città preferita?",
  nome_madre: "Qual è il nome di tua madre/padre?",
  animale_preferito: "Qual è il tuo animale preferito?",
  codicepin: "Crea il tuo codice PIN di recupero"
};

//func get domanda segreta inserita da user, per recupero password
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


// func register: registra dati user creando un account
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

// func per recupero dati user
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


//func per recupero canzoni prenotate
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

/*
//genera lista classifica topN
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
*/
// genera lista classifica topN (live)
app.get('/api/classifica/top', async (req, res) => {
  const n = parseInt(req.query.n) || 30;
  try {
    const [rows] = await db.query(
      `SELECT id, artista, canzone, num_richieste 
       FROM classifica 
       ORDER BY num_richieste DESC 
       LIMIT ?`,
      [n]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero della classifica' });
  }
});

app.get('/api/healthz', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    res.json({ ok: rows?.[0]?.ok === 1, snapshotConfigured: Boolean(process.env.SNAPSHOT_KEY) });
  } catch (e) {
    res.status(500).json({ ok: false, snapshotConfigured: Boolean(process.env.SNAPSHOT_KEY),
      code: e.code || null, detail: e.sqlMessage || e.message || null });
  }
});

app.get('/api/debug/classifica', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT artista, canzone, num_richieste
       FROM classifica
       ORDER BY num_richieste DESC
       LIMIT 5`
    );
    res.json({ count: rows.length, sample: rows });
  } catch (e) {
    res.status(500).json({ message: 'Errore query classifica',
      code: e.code || null, detail: e.sqlMessage || e.message || null });
  }
});


// POST: genera/rigenera lo snapshot del giorno (protetto da chiave)
app.post('/api/classifica/snapshot/run', async (req, res) => {
  if (!SNAPSHOT_KEY || req.header('x-snapshot-key') !== SNAPSHOT_KEY) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const n = Number.parseInt(req.query.n, 10) || 100;
  const isDry = String(req.query.dry) === '1';
  const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const [top] = await db.query(
      `SELECT artista, canzone, num_richieste
       FROM classifica
       ORDER BY num_richieste DESC
       LIMIT ?`,
      [n]
    );

    if (isDry) {
      return res.json({ date: snapshotDate, items: top.length, sample: top.slice(0, 5) });
    }

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      await conn.query('DELETE FROM classifica_snapshot WHERE snapshot_date = ?', [snapshotDate]);

      if (top.length > 0) {
        const values = top.map((row, idx) => [
          snapshotDate, idx + 1, row.artista, row.canzone, row.num_richieste ?? 0
        ]);

        const placeholders = values.map(() => '(?,?,?,?,?)').join(',');
        const flat = values.flat();

        try {
          await conn.query(
            `INSERT INTO classifica_snapshot (snapshot_date, \`position\`, artista, canzone, num_richieste)
             VALUES ${placeholders}`,
            flat
          );
        } catch (bulkErr) {
          const singleSql = `INSERT INTO classifica_snapshot
            (snapshot_date, \`position\`, artista, canzone, num_richieste)
            VALUES (?,?,?,?,?)`;
          for (const row of values) await conn.query(singleSql, row);
        }
      }

      await conn.commit();
      return res.json({ message: 'Snapshot generato', date: snapshotDate, items: top.length });
    } catch (txErr) {
      if (conn) await conn.rollback();
      return res.status(500).json({
        message: 'Errore creazione snapshot',
        code: txErr.code || null,
        detail: txErr.sqlMessage || txErr.message || null
      });
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    return res.status(500).json({
      message: 'Errore creazione snapshot',
      code: err.code || null,
      detail: err.sqlMessage || err.message || null
    });
  }
});



// GET: ultimo snapshot disponibile (top N) con data+ora
app.get('/api/classifica/snapshot/top', async (req, res) => {
  try {
    const n = Number.parseInt(req.query.n, 10) || 30;

    const [[last]] = await db.query('SELECT MAX(snapshot_date) AS latest FROM classifica_snapshot');
    if (!last || !last.latest) return res.json([]);

    const [rows] = await db.query(
      `SELECT \`position\`, artista, canzone, num_richieste, snapshot_date, created_at
       FROM classifica_snapshot
       WHERE snapshot_date = ?
       ORDER BY \`position\` ASC
       LIMIT ?`,
      [last.latest, n]
    );

    res.json(rows);
  } catch (err) {
    console.error('Errore GET snapshot top:', err.message || err);
    res.status(500).json({ message: 'Errore nel recupero snapshot' });
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

// func per prenotare canzoni in lista
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



// func per recuperare i voti di ogni esibizione user
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

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 8;
    const offset = (page - 1) * pageSize;

    // conteggio totale
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM wishlist WHERE user_id = ?',
      [userId]
    );

    if (total === 0) {
      return res.json({
        wishlist: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: page
      });
    }

    const totalPages = Math.ceil(total / pageSize);

    // pagina corrente
    const [rows] = await db.query(
      `SELECT id, user_id, canzone, artista, tonalita
       FROM wishlist
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );

    res.json({
      wishlist: rows,
      totalItems: total,
      totalPages,
      currentPage: page
    });

  } catch (err) {
    console.error('Errore nel recupero wishlist:', err);
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


// func aggiorna status canzone cantata/da cantare
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

//func aggiunta partecipante , calcola numero partecipanti tot / disponibili
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

// func recupera nome partecipante
app.get('/api/canzoni/:id/nome-partecipante', async (req, res) => {
  const { id } = req.params;
  try {
    const [row] = await db.query('SELECT nome FROM canzoni WHERE id = ?', [id]);
    res.json({ nome: row[0]?.nome || 'Anonimo' });
  } catch (err) {
    res.status(500).json({ message: 'Errore durante recupero nome' });
  }
});

//func per reset lista canzoni (solo admin)
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

// func per generare lista top list 20 max num
app.get('/api/top20', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT canzone, artista, numero_richieste FROM canzoni ORDER BY numero_richieste DESC LIMIT 20');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nel recupero della top 20' });
  }
});

/*
//func genera lista archivio canzoni storico
app.get('/api/archivio-musicale', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM raccolta_canzoni ORDER BY artista ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Errore nell\'archivio musicale' });
  }
});
*/

// GET con paginazione
app.get('/api/archivio-musicale', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // default: 1
    const limit = parseInt(req.query.limit) || 10; // default: 10
    const offset = (page - 1) * limit;

    // Ottieni dati paginati
    const [rows] = await db.query(
      'SELECT * FROM raccolta_canzoni ORDER BY artista ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    // Conta il numero totale di righe
    const [countResult] = await db.query('SELECT COUNT(*) as count FROM raccolta_canzoni');
    const totalItems = countResult[0].count;
    const totalPages = Math.ceil(totalItems / limit);

    // Rispondi con i dati paginati
    res.json({
      data: rows,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore nell\'archivio musicale' });
  }
});

// GET ricerca senza paginazione
app.get('/api/archivio-musicale/search', async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : '%';

    const [rows] = await db.query(
      'SELECT * FROM raccolta_canzoni WHERE artista LIKE ? OR canzone LIKE ? ORDER BY artista ASC',
      [search, search]
    );

    res.json(rows); // restituisce direttamente un array
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore nella ricerca dell\'archivio musicale' });
  }
});


//func per modificare dati canzoni già in lista prenotate
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

//func per cancellare canzone da archivio canzoni storico
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

//func per eliminare singola canzone da lista canzoni
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
    console.error('Errore in DELETE /api/canzoni/:id', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

//func per eliminare singola canzone da user-canzoni
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

// ===========================
//  SOCKET.IO - CHAT (globale + DM) con presenza IN MEMORIA
// ===========================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false // non usiamo cookie
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'] // fallback utile in prod (CDN/Proxy)
});

// --- In-memory structures (no DB) ---
const socketsByUser = new Map(); // userId -> Set<socketId>
const usersBySocket = new Map();  // socketId -> { id, username, ruolo }
const activeUsers   = new Map();  // userId -> { id, username, status }
const historyGlobal = [];         // ultimi N messaggi globali
const historyDm     = new Map();  // "a:b" -> array messaggi
const MAX_HISTORY   = 50;

function presenceSnapshot() {
  return Array.from(activeUsers.values());
}

// Auth WS: SOLO UTENTI LOGGATI (no guest)
io.use((socket, next) => {
  try {
    const fromAuth  = socket.handshake?.auth?.token;
    const fromQuery = socket.handshake?.query?.token;
    const token = (fromAuth || fromQuery || '').toString().trim();
    if (!token) return next(new Error('Unauthorized'));

    const user = jwt.verify(token, SECRET_KEY);
    socket.data.user = {
      id: Number(user.id),
      username: String(user.username || 'User'),
      ruolo: String(user.ruolo || '')
    };
    return next();
  } catch (e) {
    console.error('[ws] auth error:', e.message);
    return next(new Error('Unauthorized'));
  }
});

// helper per DM: chiave deterministica
function dmKey(a, b) {
  const A = Number(a), B = Number(b);
  return A < B ? `${A}:${B}` : `${B}:${A}`;
}

io.on('connection', (socket) => {
  const u = socket.data.user; // { id, username, ruolo }
  if (!u?.id) {
    socket.disconnect();
    return;
  }

  // registra mappe presenza
  usersBySocket.set(socket.id, u);
  if (!socketsByUser.has(u.id)) socketsByUser.set(u.id, new Set());
  socketsByUser.get(u.id).add(socket.id);

  const wasOnline = activeUsers.has(u.id);
  activeUsers.set(u.id, { id: u.id, username: u.username, status: 'online' });

  // 1) SNAPSHOT SOLO AL NUOVO SOCKET (evita flash/race globali)
  const snap = presenceSnapshot();
  socket.emit('presence:list', snap);
  socket.emit('users:list', snap);

  // 2) Eventi incrementali agli ALTRI
  if (!wasOnline) {
    socket.broadcast.emit('presence:update', { id: u.id, username: u.username, status: 'online' });
    socket.broadcast.emit('users:online',   { id: u.id, username: u.username });
  }

  // stanza globale
  socket.join('global');

  // === SYNC esplicita richiesta dal client quando è "pronto"
  socket.on('presence:get', () => {
    const now = presenceSnapshot();
    socket.emit('presence:list', now);
    socket.emit('users:list', now);
  });

  // Manuale: offline/online
  socket.on('presence:manual', ({ off }) => {
    if (off) {
      const set = socketsByUser.get(u.id);
      if (set) {
        for (const sid of Array.from(set)) {
          const s = io.sockets.sockets.get(sid);
          try { s?.disconnect(true); } catch {}
        }
      }
    } else {
      // tornerà online con la normale connect()
    }
  });

  // === HISTORY ===
  socket.on('chat:history', (payload) => {
    if (payload && typeof payload.to === 'number') {
      const key = dmKey(u.id, payload.to);
      socket.emit('chat:history', historyDm.get(key) || []);
    } else {
      socket.emit('chat:history', historyGlobal);
    }
  });

  // apertura DM (per inviare history)
  socket.on('chat:dm:open', ({ peerId }) => {
    const pid = Number(peerId);
    if (!pid || pid === u.id) return;
    const key = dmKey(u.id, pid);
    socket.join(`dm:${key}`);
    socket.emit('chat:dm:history', { peerId: pid, messages: historyDm.get(key) || [] });
  });

  // === INVIO MESSAGGI DM ===
  socket.on('chat:dm:send', (data) => {
    const pid = Number(data?.to);
    const textRaw = String(data?.text ?? '');
    if (!pid || pid === u.id || !textRaw.trim()) return;

    const safeText = textRaw.slice(0, 2000);
    const clientId = (typeof data?.clientId === 'string' && data.clientId.length <= 100)
      ? data.clientId
      : undefined;

    const msg = {
      id: (typeof randomUUID === 'function' ? randomUUID() : String(Date.now())),
      clientId,               // torna ai client per eventuale dedup
      author: u.username,
      text: safeText,
      time: Date.now(),
      fromUserId: u.id,       // campi attesi dal client
      toUserId: pid
    };

    const key = dmKey(u.id, pid);
    const arr = historyDm.get(key) || [];
    arr.push(msg);
    if (arr.length > MAX_HISTORY) arr.shift();
    historyDm.set(key, arr);

    // consegna al DESTINATARIO (tutte le sue tab)
    const toSockets = socketsByUser.get(pid);
    if (toSockets) {
      for (const sid of Array.from(toSockets)) {
        io.to(sid).emit('chat:dm:message', msg);
      }
    }

    // consegna alle ALTRE tab del MITTENTE (escludi il socket corrente)
    const meSockets = socketsByUser.get(u.id);
    if (meSockets) {
      for (const sid of Array.from(meSockets)) {
        if (sid !== socket.id) io.to(sid).emit('chat:dm:message', msg);
      }
    }

    // ❌ niente broadcast alla stanza DM: evitato per non duplicare
    // io.to(`dm:${key}`).emit('chat:dm:message', msg);
  });

  // (opzionale) chat globale
  socket.on('chat:send', ({ text }) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    const msg = {
      id: (typeof randomUUID === 'function' ? randomUUID() : String(Date.now())),
      author: u.username,
      text: t.slice(0, 2000),
      time: Date.now(),
      fromUserId: u.id
    };
    historyGlobal.push(msg);
    if (historyGlobal.length > MAX_HISTORY) historyGlobal.shift();
    io.to('global').emit('chat:message', msg);
    // Se fai eco locale anche nella globale, valuta:
    // socket.to('global').emit('chat:message', msg);
  });

  // cleanup su disconnect
  socket.on('disconnect', () => {
    usersBySocket.delete(socket.id);
    const set = socketsByUser.get(u.id);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        socketsByUser.delete(u.id);
        activeUsers.delete(u.id);

        // Eventi incrementali agli altri
        socket.broadcast.emit('presence:remove', { id: u.id });
        socket.broadcast.emit('users:offline',   { id: u.id });
      }
    }
  });
});


server.listen(PORT, () => {
  console.log(`🚀 HTTP+WS attivi su http://localhost:${PORT}`);
});
