const db = require('./db/pool');

async function generaSnapshot() {
  try {
    // Prendiamo tutti i record correnti dalla classifica
    const [rows] = await db.query(
      'SELECT id, artista, canzone, num_richieste FROM classifica'
    );

    console.log('Records letti da classifica:', rows);

    if (rows.length === 0) {
      console.log('Nessun record trovato nella classifica.');
      return;
    }

    // Data e ora completa in formato YYYY-MM-DD HH:MM:SS
    const snapshotDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    console.log('Data e ora snapshot:', snapshotDate);

    // Inseriamo o aggiorniamo lo snapshot per ogni record
    const insertPromises = rows.map(r => {
      console.log(`Pronto a inserire/aggiornare snapshot: ${r.artista} - ${r.canzone} (${r.num_richieste})`);
      return db.query(
        `INSERT INTO snapshot_classifica (id_classifica, artista, canzone, num_richieste, snapshot_date)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE num_richieste = VALUES(num_richieste), snapshot_date = VALUES(snapshot_date)`,
        [r.id, r.artista, r.canzone, r.num_richieste, snapshotDate]
      );
    });

    const results = await Promise.all(insertPromises);
    console.log('Risultati inserimento snapshot:', results);

    console.log(`Snapshot creato correttamente per ${snapshotDate}.`);
  } catch (err) {
    console.error('Errore durante la creazione dello snapshot:', err);
    throw err;
  }
}

module.exports = generaSnapshot;
