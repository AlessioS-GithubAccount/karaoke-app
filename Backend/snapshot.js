const db = require('./db/pool');

async function generaSnapshot() {
  try {
    const [rows] = await db.query('SELECT id, artista, canzone, num_richieste FROM classifica');
    console.log('Records letti da classifica:', rows);

    if (rows.length === 0) {
      console.log('Nessun record trovato nella classifica.');
      return;
    }

    // Data e ora locale in formato YYYY-MM-DD HH:MM:SS
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const snapshotDateLocal = localDate.toISOString().slice(0, 19).replace('T', ' ');
    console.log('Data e ora snapshot (locale):', snapshotDateLocal);

    for (const r of rows) {
      console.log(`Pronto a inserire/aggiornare snapshot: ${r.artista} - ${r.canzone} (${r.num_richieste})`);
      await db.query(
        `INSERT INTO snapshot_classifica (id_classifica, artista, canzone, num_richieste, snapshot_date)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE num_richieste = VALUES(num_richieste), snapshot_date = VALUES(snapshot_date)`,
        [r.id, r.artista, r.canzone, r.num_richieste, snapshotDateLocal]
      );
    }

    console.log(`Snapshot creato correttamente per ${snapshotDateLocal}.`);
  } catch (err) {
    console.error('Errore durante la creazione dello snapshot:', err);
    throw err;
  }
}

module.exports = generaSnapshot;
