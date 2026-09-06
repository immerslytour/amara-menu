import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'data');
for (const f of ['app.db', 'app.db-wal', 'app.db-shm', 'mock-marketplace.json']) {
  const full = path.join(dir, f);
  if (fs.existsSync(full)) {
    fs.rmSync(full);
    console.log('removed', f);
  }
}
console.log('database reset');
