const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- database ----------
// Real SQLite, running as pure JS/WebAssembly (sql.js) — no native compiler
// needed. The database is exported to a file on disk after every write.
const DB_PATH = path.join(__dirname, 'kathyshub.sqlite');
let db;

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getUser(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  stmt.bind([email]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function start() {
  const SQL = await initSqlJs();

  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      email         TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      name          TEXT,
      dob           TEXT,
      gender        TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  // seed a demo account the first time the database is created
  if (!getUser('admin@site.dev')) {
    const hash = bcrypt.hashSync('1234', 10);
    db.run(
      'INSERT INTO users (email, password_hash, name, dob, gender) VALUES (?, ?, ?, ?, ?)',
      ['admin@site.dev', hash, 'Admin', '', '']
    );
    persist();
    console.log('Seeded demo account: admin@site.dev / 1234');
  }

  // ---------- routes ----------
  app.post('/api/register', (req, res) => {
    const { email, password, confirm, name, dob, gender } = req.body || {};

    if (!email || !password || !confirm || !name || !dob || !gender) {
      return res.status(400).json({ error: 'Please fill out every field.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password !== confirm) {
      return res.status(400).json({ error: 'Password and confirm password do not match.' });
    }
    if (getUser(normalizedEmail)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.run(
      'INSERT INTO users (email, password_hash, name, dob, gender) VALUES (?, ?, ?, ?, ?)',
      [normalizedEmail, hash, String(name).trim(), dob, gender]
    );
    persist();

    res.json({ ok: true, email: normalizedEmail });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = getUser(normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: 'No account found with that email.' });
    }

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Wrong password for that account.' });
    }

    res.json({ ok: true, email: user.email, name: user.name });
  });

  app.post('/api/reset-password', (req, res) => {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = getUser(normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: 'No account found with that email.' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hash, normalizedEmail]);
    persist();

    res.json({ ok: true });
  });

  app.listen(PORT, () => {
    console.log(`Kathy's Hub server running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
