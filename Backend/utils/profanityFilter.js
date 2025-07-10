const Filter = require('bad-words');
const fs = require('fs');
const path = require('path');

const filter = new Filter();

// Carica blacklist italiana
const blacklistPath = path.join(__dirname, 'blacklist_it.json');
const blacklist = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));

// Aggiungila al filtro
filter.addWords(...blacklist);

function hasProfanity(text) {
  return filter.isProfane(text);
}

function cleanProfanity(text) {
  return filter.clean(text);
}

module.exports = { hasProfanity, cleanProfanity };
