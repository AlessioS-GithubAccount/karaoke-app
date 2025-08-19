const fs = require('fs');
const generaSnapshot = require('./snapshot'); // importa la funzione dal tuo snapshot.js

async function runSnapshot() {
  const timestamp = new Date().toISOString();
  const logMessage = `Esecuzione snapshot alle: ${timestamp}\n`;

  try {
    console.log(logMessage); // log su console

    // log su file snapshot.log (crea il file se non esiste, aggiunge in coda)
    fs.appendFileSync('snapshot.log', logMessage);

    // esegui lo snapshot
    await generaSnapshot();

    const successMessage = `Snapshot completato alle: ${timestamp}\n`;
    console.log(successMessage);
    fs.appendFileSync('snapshot.log', successMessage);
  } catch (err) {
    const errorMessage = `Errore snapshot alle: ${timestamp} - ${err.message}\n`;
    console.error(errorMessage);
    fs.appendFileSync('snapshot.log', errorMessage);
  }
}

// esegue la funzione
runSnapshot();
