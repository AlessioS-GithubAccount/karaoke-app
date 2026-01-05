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
// Origini “esatte” (da env + fallback)
const allowedOriginsFromEnv =
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const allowedOriginsExact = new Set([
  ...allowedOriginsFromEnv,
  'https://karaoke-webapp0.netlify.app',
  'http://localhost:4200'
]);

// ✅ Netlify branch deploy / deploy preview:
// es: https://my-branch--karaoke-webapp0.netlify.app
// es: https://deploy-preview-123--karaoke-webapp0.netlify.app
const allowedOriginRegex = [
  /^https:\/\/.*--karaoke-webapp0\.netlify\.app$/,
];

function isAllowedOrigin(origin) {
  // origin può essere undefined/null in alcune chiamate server-to-server
  if (!origin) return true;
  if (allowedOriginsExact.has(origin)) return true;
  return allowedOriginRegex.some(re => re.test(origin));
}

const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};

// CORS PRIMA delle rotte
app.use(cors(corsOptions));

// Preflight
app.options('*', cors(corsOptions));


// Body parser JSON
app.use(express.json());

// ====== CONFIG / SECRETS ======
const PORT = process.env.PORT || 3000;

// Spostati su .env (con fallback di sviluppo)
const SECRET_KEY = process.env.SECRET_KEY || 'dev_secret_change_me';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'dev_refresh_change_me';

const PIN_ADMIN = '0000';  // credenziale di cortesia per testing (register admin mode)

// Durate token
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '30d';   // user/admin
const GUEST_TOKEN_TTL  = process.env.GUEST_TOKEN_TTL  || '30d';   // guest

let refreshTokens = [];

// ===== Realtime QUEUE (public) =====
let ioQueue = null;

/**
 * Notifica a TUTTI (anche non loggati) che la lista canzoni è cambiata.
 * Il client farà refresh via GET /api/canzoni.
 */
function emitQueueChanged(type, payload = {}) {
  try {
    if (!ioQueue) return;
    ioQueue.emit('queue:changed', {
      type,
      ...payload,
      ts: Date.now()
    });
  } catch (e) {
    // no crash
  }
}


// ===== Helpers token =====
function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return null;
  const parts = String(authHeader).split(' ');
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

function decodeTokenIfPresent(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch {
    return null;
  }
}

function verifyToken(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ message: 'Token mancante' });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    // Questo middleware è per utenti veri (admin/client), non guest
    if (decoded?.ruolo === 'guest') {
      return res.status(403).json({ message: 'Token non valido' });
    }
    if (typeof decoded?.id !== 'number') {
      return res.status(403).json({ message: 'Token non valido' });
    }

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

// middleware: permette guest o user (se token valido), senza bloccare se token assente
function optionalVerifyToken(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return next();

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return next();
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

//admin può aggiungere manualmente una canzone per i client o se stesso
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

    // ✅ realtime
    emitQueueChanged('added', { canzoneId: result.insertId });

    return res.status(201).json({ message: 'Canzone aggiunta con successo', id: result.insertId });
  } catch (err) {
    console.error('Errore aggiunta canzone:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore interno del server' });
  }
});


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

// cambio password by vecchia password
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

// cambio password by risposta segreta
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

// inizializzazione leoProfanity
const leoProfanity = require('leo-profanity');
leoProfanity.add(leoProfanity.getDictionary('en'));
leoProfanity.add(leoProfanity.getDictionary('it'));
const customBadWords = require('./utils/profanityList');
leoProfanity.add(customBadWords);

// func per aggiungere partecipante a un esibizione
app.post('/api/canzoni/:id/aggiungi-partecipante', optionalVerifyToken, async (req, res) => {
  const canzoneId = Number(req.params.id);
  let { nomePartecipante } = req.body;

  if (!nomePartecipante) {
    return res.status(400).json({ message: 'Nome partecipante obbligatorio.' });
  }
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Devi essere loggato per partecipare.' });
  }

  nomePartecipante = leoProfanity.clean(nomePartecipante);

  const userId = req.user.id;
  const now = new Date();

  try {
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

    if (!p2) {
      p2 = nomePartecipante;
      await db.query('UPDATE canzoni SET partecipante_2 = ? WHERE id = ?', [nomePartecipante, canzoneId]);
    } else if (!p3) {
      p3 = nomePartecipante;
      await db.query('UPDATE canzoni SET partecipante_3 = ? WHERE id = ?', [nomePartecipante, canzoneId]);
    } else {
      return res.status(400).json({ message: 'Numero massimo di partecipanti raggiunto per questa canzone.' });
    }

    const esibizioneId = canzoneId;
    if (canzone.user_id) {
      await db.query(
        `UPDATE user_storico_esibizioni
         SET partecipante_2 = ?, partecipante_3 = ?
         WHERE user_id = ? AND esibizione_id = ?`,
        [p2 || null, p3 || null, canzone.user_id, esibizioneId]
      );
    }

    const norm = s => (s || '').trim().toLowerCase();
    const me = norm(nomePartecipante);
    const registrante = canzone.registrante_nome || null;

    let altro = null;
    if (p2 && norm(p2) !== me) altro = p2;
    if (p3 && norm(p3) !== me) altro = altro ? altro : p3;

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
        canzone.registrante_nome,
        canzone.artista,
        canzone.canzone,
        registrante,
        altro
      ]
    );

    return res.json({ message: 'Partecipazione registrata con successo.' });

  } catch (error) {
    console.error('[ERRORE] POST aggiungi-partecipante:', error);
    return res.status(500).json({ message: 'Errore interno del server.' });
  }
});

// storico esibizioni user
app.get('/api/esibizioni/user/:id', async (req, res) => {
  const userId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 8;
  const offset = (page - 1) * pageSize;

  try {
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

// voti emoji
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

// mapping domande di sicurezza
const mapDomande = {
  nome_animale_domestico: "Qual è il nome del tuo animale domestico?",
  "città_preferita": "Qual è la tua città preferita?",
  nome_madre: "Qual è il nome di tua madre/padre?",
  animale_preferito: "Qual è il tuo animale preferito?",
  codicepin: "Crea il tuo codice PIN di recupero"
};

// get domanda segreta
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

// verifica risposta
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

// reset password
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

// ===== GUEST LOGIN (nuovo) =====
app.post('/api/auth/guest', (req, res) => {
  // Se mi mandi già un guest token valido, riuso quello (così non cambia ID)
  const existing = decodeTokenIfPresent(req);
  if (existing && existing.ruolo === 'guest' && typeof existing.guest_id === 'string' && existing.guest_id.length > 0) {
    return res.json({
      message: 'Guest già attivo',
      guest_id: existing.guest_id,
      guestToken: getBearerToken(req),
      expiresIn: GUEST_TOKEN_TTL
    });
  }

  // Se sei loggato come user/admin, non ha senso creare un guest
  if (existing && existing.ruolo && existing.ruolo !== 'guest') {
    return res.status(400).json({ message: 'Sei già loggato come utente' });
  }

  // Nuovo guest
  const guest_id = (typeof randomUUID === 'function')
    ? randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const guestToken = jwt.sign(
    { guest_id, ruolo: 'guest' },
    SECRET_KEY,
    { expiresIn: GUEST_TOKEN_TTL }
  );

  return res.json({
    message: 'Guest creato',
    guest_id,
    guestToken,
    expiresIn: GUEST_TOKEN_TTL
  });
});

// login user/admin
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

    const token = jwt.sign(
      { id: user.id, username: user.username, ruolo: user.ruolo },
      SECRET_KEY,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    const refreshToken = jwt.sign(
      { id: user.id, username: user.username, ruolo: user.ruolo },
      REFRESH_SECRET,
      {expiresIn: process.env.REFRESH_TOKEN_TTL || '90d' }
    );

    refreshTokens.push(refreshToken);

    res.json({ message: 'Login riuscito', token, refreshToken, ruolo: user.ruolo });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Errore interno del server' });
  }
});

// refresh access token
app.post('/api/auth/token', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ message: 'Refresh token non valido' });
  }

  try {
    const user = jwt.verify(refreshToken, REFRESH_SECRET);

    // NB: qui generiamo SOLO access token user/admin
    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, ruolo: user.ruolo },
      SECRET_KEY,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    res.json({ token: newAccessToken });
  } catch (err) {
    return res.status(403).json({ message: 'Token non valido' });
  }
});

// logout
app.post('/api/auth/logout', async (req, res) => {
  const { username, refreshToken } = req.body;
  try {
    if (refreshToken) {
      refreshTokens = refreshTokens.filter(token => token !== refreshToken);
    }
    if (username) {
      await db.query('UPDATE users SET online_status = 0 WHERE username = ?', [username]);
    }
    res.json({ message: 'Logout effettuato' });
  } catch (err) {
    res.status(500).json({ message: 'Errore durante il logout' });
  }
});

// register
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

// get user by username
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

// get canzoni (PUBBLICO) - usa l'ordine reale della coda
app.get('/api/canzoni', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM canzoni ORDER BY posizione ASC, id ASC');
    res.json(rows);
  } catch (err) {
    console.error('Errore GET /api/canzoni:', err?.sqlMessage || err?.message || err);
    res.status(500).json({ message: 'Errore nel recupero delle canzoni' });
  }
});


// riordina (SOLO ADMIN) + realtime
app.post('/api/canzoni/riordina', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const nuovaLista = req.body;

  if (!Array.isArray(nuovaLista)) {
    return res.status(400).json({ message: 'Formato dati non valido' });
  }

  // hardening minimo: mi aspetto [{id, posizione}, ...]
  for (const item of nuovaLista) {
    const idOk = Number.isFinite(Number(item?.id));
    const posOk = Number.isFinite(Number(item?.posizione));
    if (!idOk || !posOk) {
      return res.status(400).json({ message: 'Oggetti lista non validi (id/posizione)' });
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const canzone of nuovaLista) {
      await conn.query(
        'UPDATE canzoni SET posizione = ? WHERE id = ?',
        [Number(canzone.posizione), Number(canzone.id)]
      );
    }

    await conn.commit();

    // 🔥 realtime: avvisa tutti
    emitQueueChanged('reordered', { count: nuovaLista.length });

    return res.json({ message: 'Riordinamento completato con successo' });
  } catch (err) {
    await conn.rollback();
    console.error('Errore POST /api/canzoni/riordina:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore durante il riordinamento' });
  } finally {
    conn.release();
  }
});



// prenota canzone (usa token se presente) + realtime
app.post('/api/canzoni', optionalVerifyToken, async (req, res) => {
  let { nome, artista, canzone, tonalita, note, user_id, guest_id, accetta_partecipanti } = req.body;

  // Determino identità effettiva
  let effectiveUserId = null;
  let effectiveGuestId = null;

  // Se ho token:
  if (req.user) {
    if (req.user.ruolo === 'guest') {
      if (typeof req.user.guest_id === 'string' && req.user.guest_id.trim()) {
        effectiveGuestId = req.user.guest_id.trim();
      } else {
        return res.status(401).json({ message: 'Guest token non valido' });
      }
    } else {
      // user/admin
      if (typeof req.user.id === 'number') {
        effectiveUserId = req.user.id;
      } else {
        return res.status(401).json({ message: 'Token non valido' });
      }
    }
  }

  // Hardening: se nel body mi mandi user_id ma NON sei autenticato come user, rifiuto
  const bodyUserId = (user_id != null && user_id !== '') ? Number(user_id) : null;
  if (bodyUserId && !effectiveUserId) {
    return res.status(401).json({ message: 'user_id richiede autenticazione' });
  }

  // Applico override in base al token (se presente)
  if (effectiveUserId) {
    user_id = effectiveUserId;
    guest_id = null;
  } else if (effectiveGuestId) {
    guest_id = effectiveGuestId;
    user_id = null;
  }

  // Fallback compatibilità: se non ho token, accetto guest_id dal body (vecchi client)
  if (!user_id && !guest_id) {
    return res.status(400).json({ message: 'user_id o guest_id obbligatorio' });
  }

  // validazioni minime
  if (!nome || !artista || !canzone) {
    return res.status(400).json({ message: 'Campi obbligatori mancanti' });
  }

  // Censura & normalizzazioni
  nome = leoProfanity.clean(String(nome));
  if (note) note = leoProfanity.clean(String(note));

  artista = normalizeSongName(String(artista));
  canzone = normalizeSongName(String(canzone));

    // ✅ BLOCCO DOPPIONI: stessa canzone già in lista (tabella canzoni)
  const [dup] = await db.query(
    `SELECT id FROM canzoni WHERE artista = ? AND canzone = ? LIMIT 1`,
    [artista, canzone]
  );

  if (dup.length > 0) {
    return res.status(409).json({
      code: 'DUPLICATE_IN_QUEUE',
      message: 'Questa canzone è già presente in lista. Scegline un’altra.',
      existingId: dup[0].id
    });
  }

  try {
    const [maxPosResult] = await db.query('SELECT MAX(posizione) AS maxPos FROM canzoni');
    const maxPos = maxPosResult?.[0]?.maxPos || 0;
    const nuovaPosizione = Number(maxPos) + 1;

    const [result] = await db.query(
      `INSERT INTO canzoni 
       (nome, artista, canzone, tonalita, note, user_id, guest_id, accetta_partecipanti, posizione) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome,
        artista,
        canzone,
        tonalita || null,
        note || null,
        user_id || null,
        guest_id || null,
        accetta_partecipanti ? 1 : 0,
        nuovaPosizione
      ]
    );

    const canzoneId = result.insertId;

    // storico solo per user veri
    if (user_id) {
      await db.query(
        `INSERT INTO user_storico_esibizioni 
         (user_id, esibizione_id, canzone_id, tonalita, nome, artista, canzone, data_esibizione) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [user_id, canzoneId, canzoneId, tonalita || null, nome, artista, canzone]
      );
    }

    // raccolta + classifica
    await db.query(
      `INSERT INTO raccolta_canzoni (artista, canzone, num_richieste)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE num_richieste = num_richieste + 1`,
      [artista, canzone]
    );

    await db.query(
      `INSERT INTO classifica (artista, canzone, num_richieste)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE num_richieste = num_richieste + 1`,
      [artista, canzone]
    );

    // ✅ Realtime: avvisa tutti (anon/guest/user/admin)
    emitQueueChanged('added', { canzoneId });

    return res.json({
      message: 'Canzone aggiunta e storico + classifica aggiornati con successo',
      canzoneId,
      posizione: nuovaPosizione
    });
  } catch (err) {
    console.error('Errore POST /api/canzoni:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: "Errore durante l'aggiunta" });
  }
});



// voti per esibizione
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

    res.json(voti || []);
  } catch (err) {
    console.error('Errore recupero voti:', err);
    res.status(500).json({ message: 'Errore nel recupero dei voti' });
  }
});

// wishlist (solo user)
app.get('/api/wishlist', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 8;
    const offset = (page - 1) * pageSize;

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


// PRIORITY LOCK (solo admin puo flaggare canzone in priorità per escluderla da algoritmo) + realtime
app.put('/api/canzoni/:id/priority-lock', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const locked = !!req.body?.locked;

  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'ID non valido' });
  }

  try {
    const [result] = await db.query(
      'UPDATE canzoni SET priority_lock = ? WHERE id = ?',
      [locked ? 1 : 0, id]
    );

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ message: 'Canzone non trovata' });
    }

    // realtime: lista canzoni si ricarica
    emitQueueChanged('priority:lock', { id, priority_lock: locked ? 1 : 0 });

    return res.json({ message: 'Priority aggiornata', id, priority_lock: locked ? 1 : 0 });
  } catch (err) {
    console.error('Errore PUT /api/canzoni/:id/priority-lock:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore interno del server' });
  }
});


//modifica stato cantata/da cantare
app.put('/api/canzoni/:id/cantata' , verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { cantata } = req.body;

  try {
    await db.query('UPDATE canzoni SET cantata = ? WHERE id = ?', [cantata ? 1 : 0, id]);

    // ✅ realtime
    emitQueueChanged('cantata', { id: Number(id), cantata: !!cantata });

    return res.json({ message: 'Stato cantata aggiornato' });
  } catch (err) {
    console.error('Errore PUT /api/canzoni/:id/cantata:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore aggiornamento' });
  }
});


//modifica numero partecipanti
app.put('/api/canzoni/:id/partecipa', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE canzoni SET partecipanti_add = partecipanti_add + 1, numero_richieste = numero_richieste + 1 WHERE id = ?',
      [id]
    );

    const [updated] = await db.query('SELECT partecipanti_add FROM canzoni WHERE id = ?', [id]);

    // ✅ realtime (se quei valori stanno in UI)
    emitQueueChanged('updated', { id: Number(id) });

    return res.json(updated[0]);
  } catch (err) {
    console.error('Errore PUT /api/canzoni/:id/partecipa:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore durante la partecipazione' });
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


// resetta lista-canzoni (svuota tabella in DB TRUNCATE) + realtime 
app.post('/api/reset-canzoni', async (req, res) => {
  const { password, mode } = req.body;

  if (password !== 'karaokeadmin') {
    return res.status(401).json({ message: 'Password errata' });
  }

  // mode:
  // - "soft": vecchio comportamento (azzera flag)
  // - default: svuota tabella
  const soft = String(mode || '').toLowerCase() === 'soft';

  try {
    if (soft) {
      await db.query('UPDATE canzoni SET cantata = 0, partecipanti_add = 0');
      emitQueueChanged('reset', { mode: 'soft' });
      return res.json({ message: 'Lista resettata (soft)' });
    }

    // HARD RESET: svuota davvero
    try {
      await db.query('TRUNCATE TABLE canzoni');
    } catch (e) {
      // fallback se TRUNCATE non è consentito (es. FK)
      await db.query('DELETE FROM canzoni');
      await db.query('ALTER TABLE canzoni AUTO_INCREMENT = 1');
    }

    emitQueueChanged('reset', { mode: 'truncate' });
    return res.json({ message: 'Lista svuotata (hard)' });

  } catch (err) {
    console.error('Errore POST /api/reset-canzoni:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore durante il reset' });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      'SELECT * FROM raccolta_canzoni ORDER BY artista ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const [countResult] = await db.query('SELECT COUNT(*) as count FROM raccolta_canzoni');
    const totalItems = countResult[0].count;
    const totalPages = Math.ceil(totalItems / limit);

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

app.get('/api/archivio-musicale/search', async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : '%';

    const [rows] = await db.query(
      'SELECT * FROM raccolta_canzoni WHERE artista LIKE ? OR canzone LIKE ? ORDER BY artista ASC',
      [search, search]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore nella ricerca dell\'archivio musicale' });
  }
});


app.put('/api/canzoni/:id', verifyToken, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  let { nome, artista, canzone, tonalita, note, accetta_partecipanti } = req.body;

  try {
    const [rows] = await db.query('SELECT user_id FROM canzoni WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Canzone non trovata' });

    const canzoneTrovata = rows[0];
    if (user.ruolo !== 'admin' && user.id !== canzoneTrovata.user_id) {
      return res.status(403).json({ message: 'Non autorizzato a modificare questa canzone' });
    }

    // normalizza/sanitize come in POST
    if (nome) nome = leoProfanity.clean(String(nome));
    if (note) note = leoProfanity.clean(String(note));
    if (artista) artista = normalizeSongName(String(artista));
    if (canzone) canzone = normalizeSongName(String(canzone));

    await db.query(
      `UPDATE canzoni 
       SET nome = ?, artista = ?, canzone = ?, tonalita = ?, note = ?, accetta_partecipanti = ? 
       WHERE id = ?`,
      [
        nome || null,
        artista || null,
        canzone || null,
        tonalita || null,
        note || null,
        accetta_partecipanti ? 1 : 0,
        id
      ]
    );

    // ✅ realtime
    emitQueueChanged('updated', { id: Number(id) });

    return res.json({ message: 'Canzone aggiornata con successo' });
  } catch (err) {
    console.error('Errore PUT /api/canzoni/:id:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore aggiornamento canzone' });
  }
});


app.delete('/api/archivio-musicale/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

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

// cancella canzoni da lista-canzoni component + realtime
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

    // ✅ realtime
    emitQueueChanged('deleted', { id: Number(id) });

    return res.json({ message: 'Canzone eliminata con successo' });
  } catch (err) {
    console.error('Errore DELETE /api/canzoni/:id:', err?.sqlMessage || err?.message || err);
    return res.status(500).json({ message: 'Errore interno del server' });
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
      console.log("Colonna 'numero_richieste' creata.");
    }
    const [resultAcc] = await db.query("SHOW COLUMNS FROM canzoni LIKE 'accetta_partecipanti'");
    if (resultAcc.length === 0) {
      await db.query("ALTER TABLE canzoni ADD COLUMN accetta_partecipanti TINYINT(1) DEFAULT 0");
      console.log("Colonna 'accetta_partecipanti' creata.");
    }
  } catch (e) {
    console.error("Errore creazione colonne:", e);
  }
})();


// ===========================
//  SOCKET.IO
//  - Queue canzoni: PUBBLICA (namespace /queue)
//  - Chat + presenza: SOLO utenti loggati (default namespace /)
// ===========================
const server = http.createServer(app);

// ✅ UN SOLO Server Socket.IO (un solo Engine.IO attaccato)
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false
  },
  path: '/socket.io',
  transports: ['websocket', 'polling']
});

// ===========================
//  QUEUE namespace PUBBLICO
// ===========================
// ✅ QUI: assegno alla variabile già dichiarata sopra, NON ridichiaro
ioQueue = io.of('/queue');

ioQueue.on('connection', (socket) => {
  socket.emit('queue:hello', { ok: true, ts: Date.now() });

  socket.on('queue:ping', (cb) => {
    if (typeof cb === 'function') cb({ ok: true, ts: Date.now() });
  });
});

// ===========================
//  CHAT + PRESENZA (default namespace "/") AUTH STRICT
// ===========================
const ioChat = io.of('/');

// --- In-memory structures (no DB) ---
const socketsByUser = new Map(); // userId -> Set<socketId>
const usersBySocket = new Map(); // socketId -> { id, username, ruolo }
const activeUsers   = new Map(); // userId -> { id, username, status }
const historyGlobal = [];
const historyDm     = new Map();
const MAX_HISTORY   = 50;

function presenceSnapshot() {
  return Array.from(activeUsers.values());
}

// Auth WS: SOLO UTENTI LOGGATI (NO guest, NO anon)
ioChat.use((socket, next) => {
  try {
    const fromAuth  = socket.handshake?.auth?.token;
    const fromQuery = socket.handshake?.query?.token;
    const token = (fromAuth || fromQuery || '').toString().trim();

    if (!token) return next(new Error('Unauthorized'));

    const user = jwt.verify(token, SECRET_KEY);
    if (user?.ruolo === 'guest') return next(new Error('Unauthorized'));

    socket.data.user = {
      id: Number(user.id),
      username: String(user.username || 'User'),
      ruolo: String(user.ruolo || '')
    };

    if (!Number.isFinite(socket.data.user.id)) return next(new Error('Unauthorized'));
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
});

function dmKey(a, b) {
  const A = Number(a), B = Number(b);
  return A < B ? `${A}:${B}` : `${B}:${A}`;
}

ioChat.on('connection', (socket) => {
  const u = socket.data.user;
  if (!u?.id) return socket.disconnect(true);

  usersBySocket.set(socket.id, u);

  if (!socketsByUser.has(u.id)) socketsByUser.set(u.id, new Set());
  socketsByUser.get(u.id).add(socket.id);

  const wasOnline = activeUsers.has(u.id);
  activeUsers.set(u.id, { id: u.id, username: u.username, status: 'online' });

  const snap = presenceSnapshot();
  socket.emit('presence:list', snap);
  socket.emit('users:list', snap);

  if (!wasOnline) {
    socket.broadcast.emit('presence:update', { id: u.id, username: u.username, status: 'online' });
    socket.broadcast.emit('users:online',   { id: u.id, username: u.username });
  }

  socket.join('global');

  socket.on('presence:get', () => {
    const now = presenceSnapshot();
    socket.emit('presence:list', now);
    socket.emit('users:list', now);
  });

  socket.on('presence:manual', ({ off }) => {
    if (off) {
      const set = socketsByUser.get(u.id);
      if (set) {
        for (const sid of Array.from(set)) {
          const s = ioChat.sockets.get(sid);
          try { s?.disconnect(true); } catch {}
        }
      }
    }
  });

  socket.on('chat:history', (payload) => {
    if (payload && typeof payload.to === 'number') {
      const key = dmKey(u.id, payload.to);
      socket.emit('chat:history', historyDm.get(key) || []);
    } else {
      socket.emit('chat:history', historyGlobal);
    }
  });

  socket.on('chat:dm:open', ({ peerId }) => {
    const pid = Number(peerId);
    if (!pid || pid === u.id) return;
    const key = dmKey(u.id, pid);
    socket.join(`dm:${key}`);
    socket.emit('chat:dm:history', { peerId: pid, messages: historyDm.get(key) || [] });
  });

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
      clientId,
      author: u.username,
      text: safeText,
      time: Date.now(),
      fromUserId: u.id,
      toUserId: pid
    };

    const key = dmKey(u.id, pid);
    const arr = historyDm.get(key) || [];
    arr.push(msg);
    if (arr.length > MAX_HISTORY) arr.shift();
    historyDm.set(key, arr);

    const toSockets = socketsByUser.get(pid);
    if (toSockets) for (const sid of Array.from(toSockets)) ioChat.to(sid).emit('chat:dm:message', msg);

    const meSockets = socketsByUser.get(u.id);
    if (meSockets) {
      for (const sid of Array.from(meSockets)) {
        if (sid !== socket.id) ioChat.to(sid).emit('chat:dm:message', msg);
      }
    }
  });

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
    ioChat.to('global').emit('chat:message', msg);
  });

  socket.on('disconnect', () => {
    usersBySocket.delete(socket.id);

    const set = socketsByUser.get(u.id);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        socketsByUser.delete(u.id);
        activeUsers.delete(u.id);

        socket.broadcast.emit('presence:remove', { id: u.id });
        socket.broadcast.emit('users:offline',   { id: u.id });
      }
    }
  });
});


// =======================================
// CLASSIFICA (LIVE da tabella `classifica`) + REALTIME
// - Nessuno snapshot
// - Realtime: emette queue:changed su /queue (i client poi faranno GET)
// =======================================

// =======================================
// CLASSIFICA (LIVE da tabella `classifica`) + REALTIME
// - no snapshot
// - realtime: emette queue:changed su /queue
// =======================================

// GET TOP N (live)
app.get('/api/classifica/top', async (req, res) => {
  const n = Number.parseInt(req.query.n, 10) || 30;

  try {
    const [rows] = await db.query(
      `SELECT id, artista, canzone, num_richieste
       FROM classifica
       ORDER BY num_richieste DESC
       LIMIT ?`,
      [n]
    );

    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (err) {
    console.error('Errore GET /api/classifica/top:', err?.message || err);
    res.status(500).json({ message: 'Errore nel recupero della classifica' });
  }
});

// (opzionale) GET FULL (live)
app.get('/api/classifica', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, artista, canzone, num_richieste
       FROM classifica
       ORDER BY num_richieste DESC`
    );

    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (err) {
    console.error('Errore GET /api/classifica:', err?.message || err);
    res.status(500).json({ message: 'Errore nel recupero della classifica' });
  }
});

// DELETE (admin) + realtime
app.delete('/api/classifica/:id', verifyToken, async (req, res) => {
  if (req.user?.ruolo !== 'admin') {
    return res.status(403).json({ message: 'Accesso negato: solo admin può eliminare' });
  }

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'ID non valido' });
  }

  try {
    const [result] = await db.query('DELETE FROM classifica WHERE id = ?', [id]);

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ message: 'Canzone non trovata in classifica' });
    }

    // ✅ QUI STANDARDIZZI IL TYPE
    emitQueueChanged('classifica:deleted', { id });

    res.json({ message: 'Canzone eliminata dalla classifica con successo' });
  } catch (err) {
    console.error('Errore DELETE /api/classifica/:id:', err?.message || err);
    res.status(500).json({ message: 'Errore interno server' });
  }
});



server.listen(PORT, () => {
  console.log(`HTTP+WS attivi su http://localhost:${PORT}`);
});
