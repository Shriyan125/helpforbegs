// Clean project source file
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Clean!'));
