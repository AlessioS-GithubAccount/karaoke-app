const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend Express è attivo!');
});

app.listen(port, () => {
  console.log(`Server avviato su http://localhost:${port}`);
});
