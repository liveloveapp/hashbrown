import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const LIMIT = 120;
const UUID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const RECEIPT = new RegExp('^load-' + UUID + '\\.json$');
const KEY = new RegExp('^load-' + UUID + '\\.json:(0|[1-9][0-9]*)$');
class BudgetError extends Error {}
const fail = (reason) => {
  throw new BudgetError('Load budget ' + reason);
};

function privateStat(stat, directory = false) {
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (stat.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    stat.uid !== process.getuid() ||
    (!directory && stat.nlink !== 1)
  )
    fail('requires private regular files and directory');
}

function privateOpen(file, flags) {
  const before = lstatSync(file);
  privateStat(before);
  const fd = openSync(file, flags | constants.O_NOFOLLOW);
  try {
    const after = fstatSync(fd);
    privateStat(after);
    if (before.dev !== after.dev || before.ino !== after.ino)
      fail('file changed during access');
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function parsePrivate(file, reason) {
  let fd;
  try {
    fd = privateOpen(file, constants.O_RDONLY);
    try {
      return JSON.parse(readFileSync(fd, 'utf8'));
    } catch {
      fail(reason);
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function receiptKeys(stage) {
  const keys = [];
  for (const name of readdirSync(stage)
    .filter((name) => RECEIPT.test(name))
    .sort()) {
    const receipt = parsePrivate(join(stage, name), 'receipts uncertain');
    if (!receipt || !Array.isArray(receipt.schedule?.attempts))
      fail('receipts uncertain');
    for (const [index, row] of receipt.schedule.attempts.entries()) {
      if (!row || typeof row !== 'object' || row.index !== index)
        fail('receipts uncertain');
      keys.push(name + ':' + index);
    }
  }
  if (keys.length > LIMIT) fail('receipts exceed approved limit');
  return keys;
}

function validateLedger(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !== 'attempts,limit' ||
    value.limit !== LIMIT ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > LIMIT
  )
    fail('ledger invalid');
  const seen = new Set();
  for (const [index, row] of value.attempts.entries()) {
    if (
      !row ||
      typeof row !== 'object' ||
      Object.keys(row).sort().join(',') !== 'key,ordinal' ||
      typeof row.key !== 'string' ||
      !KEY.test(row.key) ||
      !Number.isSafeInteger(Number(row.key.split(':')[1])) ||
      row.ordinal !== index + 1 ||
      seen.has(row.key)
    )
      fail('ledger invalid');
    seen.add(row.key);
  }
  return value;
}

function loadLedger(stage) {
  const file = join(stage, 'load-budget.json');
  if (!existsSync(file)) {
    // lstat also catches dangling symlinks rather than treating them as absent.
    try {
      privateStat(lstatSync(file));
    } catch (error) {
      if (error instanceof BudgetError) throw error;
    }
    fail('ledger invalid or missing');
  }
  const ledger = validateLedger(parsePrivate(file, 'ledger invalid'));
  const seen = new Set(ledger.attempts.map((row) => row.key));
  if (receiptKeys(stage).some((key) => !seen.has(key)))
    fail('ledger stale against receipts');
  return ledger;
}

function syncDirectory(stage) {
  const fd = openSync(stage, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function locked(stage, operation, createDirectory = false) {
  let lockFd;
  let ownsLock = false;
  const lock = join(stage, 'load-budget.lock');
  try {
    if (createDirectory) {
      try {
        mkdirSync(stage, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    privateStat(lstatSync(stage), true);
    try {
      lockFd = openSync(lock, 'wx', 0o600);
    } catch {
      fail('locked or lock unavailable');
    }
    ownsLock = true;
    privateStat(fstatSync(lockFd));
    fsyncSync(lockFd);
    syncDirectory(stage);
    return operation();
  } catch (error) {
    if (error instanceof BudgetError) throw error;
    fail('storage unavailable; execution blocked');
  } finally {
    if (ownsLock) {
      closeSync(lockFd);
      unlinkSync(lock);
      syncDirectory(stage);
    }
  }
}

/**
 * Seed the fixed approved budget from private raw load receipts exactly once.
 * Existing ledgers are validated and reused, including reservations whose request never started.
 * @param {string} stage - Private staging directory shared by all load runs.
 * @returns {{limit: number, attempts: Array<{key: string, ordinal: number}>}} Durable ledger.
 */
export function initializeLoadBudgetFromReceipts(stage) {
  return locked(
    stage,
    () => {
      const file = join(stage, 'load-budget.json');
      try {
        lstatSync(file);
        return loadLedger(stage);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const ledger = {
        limit: LIMIT,
        attempts: receiptKeys(stage).map((key, index) => ({
          key,
          ordinal: index + 1,
        })),
      };
      const fd = openSync(file, 'wx', 0o600);
      try {
        privateStat(fstatSync(fd));
        writeFileSync(fd, JSON.stringify(ledger) + '\n');
        fsyncSync(fd);
        syncDirectory(stage);
      } finally {
        closeSync(fd);
      }
      return ledger;
    },
    true,
  );
}

/**
 * Read a validated budget without creating or resetting it.
 * @param {string} stage - Private staging directory shared by all load runs.
 * @returns {{limit: number, attempts: Array<{key: string, ordinal: number}>}} Durable ledger.
 */
export function readLoadBudget(stage) {
  return locked(stage, () => loadLedger(stage));
}

/**
 * Durably consume one attempt before dispatch; duplicate keys and exhaustion fail closed.
 * A crash during writing can invalidate the ledger and must never reset the budget.
 * @param {string} stage - Private staging directory shared by all load runs.
 * @param {string} attemptKey - Raw receipt basename followed by its zero-based row index.
 * @returns {{limit: number, attempts: Array<{key: string, ordinal: number}>}} Updated durable ledger.
 */
export function reserveLoadRequest(stage, attemptKey) {
  return locked(stage, () => {
    const ledger = loadLedger(stage);
    if (
      typeof attemptKey !== 'string' ||
      !KEY.test(attemptKey) ||
      !Number.isSafeInteger(Number(attemptKey.split(':')[1]))
    )
      fail('attempt key invalid');
    if (ledger.attempts.some((row) => row.key === attemptKey))
      fail('duplicate attempt key');
    if (ledger.attempts.length >= LIMIT) fail('exhausted');
    const next = {
      limit: LIMIT,
      attempts: [
        ...ledger.attempts,
        { key: attemptKey, ordinal: ledger.attempts.length + 1 },
      ],
    };
    const fd = privateOpen(join(stage, 'load-budget.json'), constants.O_WRONLY);
    try {
      ftruncateSync(fd, 0);
      writeFileSync(fd, JSON.stringify(next) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return next;
  });
}
