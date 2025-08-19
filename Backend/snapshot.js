const db = require('./db/pool');

async function generaSnapshot() {
  try {
    const [rows] = await db.query(
      'SELECT artista, canzone, num_richieste FROM classifica'
    );

    if (rows.length === 0) {
      console.log('Nessun record trovato nella classifica.');
      return;
    }

    const oggi = new Date().toISOString().slice(0, 10);

    // Rimuove eventuali snapshot già presenti oggi
    await db.query(
      'DELETE FROM snapshot_classifica WHERE snapshot_date = ?',
      [oggi]
    );

    const insertValues = rows.map(r => [r.artista, r.canzone, r.num_richieste, oggi]);

    await db.query(
      'INSERT INTO snapshot_classifica (artista, canzone, num_richieste, snapshot_date) VALUES ?',
      [insertValues]
    );

    console.log(`Snapshot creato correttamente per il giorno ${oggi}.`);
  } catch (err) {
    console.error('Errore durante la creazione dello snapshot:', err);
    throw err;
  }
}

// Esporta direttamente la funzione
module.exports = generaSnapshot;
