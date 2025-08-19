const generaSnapshot = require('./snapshot');
const db = require('./db/pool');

(async () => {
  try {
    console.log('--- Test snapshot ---');
    await db.query('TRUNCATE TABLE snapshot_classifica');
    console.log('Tabella pulita.');

    await generaSnapshot();

    const [rows] = await db.query('SELECT * FROM snapshot_classifica ORDER BY snapshot_date DESC, id_classifica ASC');
    console.log('Record presenti nella tabella:');
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
