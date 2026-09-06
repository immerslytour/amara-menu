PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  createdAt   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  userId        TEXT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  photos        TEXT NOT NULL DEFAULT '[]',   -- JSON array of relative file paths
  askingPrice   REAL NOT NULL,
  minimumPrice  REAL NOT NULL,
  pickupArea    TEXT NOT NULL DEFAULT '',
  availability  TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'Electronics',
  condition     TEXT NOT NULL DEFAULT 'Used - good',
  status        TEXT NOT NULL DEFAULT 'DRAFT',
  aiEnabled     INTEGER NOT NULL DEFAULT 1,
  generatedTitle       TEXT,
  generatedDescription TEXT,
  approvedAt    TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id           TEXT PRIMARY KEY,
  productId    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,                -- facebook | mock
  externalUrl  TEXT,
  externalId   TEXT,
  status       TEXT NOT NULL DEFAULT 'DRAFT',
  errorMessage TEXT,
  screenshotPath TEXT,
  htmlPath     TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  publishedAt  TEXT,
  createdAt    TEXT NOT NULL,
  updatedAt    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  productId     TEXT REFERENCES products(id) ON DELETE SET NULL,
  platform      TEXT NOT NULL,
  externalId    TEXT NOT NULL,
  buyerName     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'NEW',
  leadScore     INTEGER NOT NULL DEFAULT 0,
  aiEnabled     INTEGER NOT NULL DEFAULT 1,
  agreedPrice   REAL,
  humanTakeover INTEGER NOT NULL DEFAULT 0,
  lastMessageAt TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL,
  UNIQUE (platform, externalId)
);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  externalId     TEXT,
  sender         TEXT NOT NULL,              -- BUYER | AGENT | HUMAN
  text           TEXT NOT NULL,
  timestamp      TEXT NOT NULL,
  createdAt      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_unique
  ON messages(conversationId, externalId) WHERE externalId IS NOT NULL;

CREATE TABLE IF NOT EXISTS leads (
  id             TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  score          INTEGER NOT NULL,
  status         TEXT NOT NULL,
  reason         TEXT NOT NULL DEFAULT '',
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_events (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  level          TEXT NOT NULL DEFAULT 'info',  -- info | warn | error
  productId      TEXT,
  conversationId TEXT,
  message        TEXT NOT NULL,
  meta           TEXT,
  createdAt      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  running        INTEGER NOT NULL DEFAULT 0,
  mode           TEXT NOT NULL DEFAULT 'mock',
  workerAlive    INTEGER NOT NULL DEFAULT 0,
  browserOpen    INTEGER NOT NULL DEFAULT 0,
  loggedIn       INTEGER NOT NULL DEFAULT 0,
  needsVerification INTEGER NOT NULL DEFAULT 0,
  lastActivity   TEXT,
  lastActivityAt TEXT,
  lastError      TEXT,
  heartbeatAt    TEXT
);

-- Commands are how the web UI asks the agent worker process to do something.
CREATE TABLE IF NOT EXISTS agent_commands (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  payload    TEXT,
  status     TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | RUNNING | DONE | FAILED
  result     TEXT,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);

INSERT OR IGNORE INTO agent_state (id, running, mode) VALUES (1, 0, 'mock');
INSERT OR IGNORE INTO users (id, name, createdAt)
  VALUES ('local-user', 'Local Seller', datetime('now'));
