// Postgres lokal untuk pengembangan dan pengujian (bukan produksi).
// Pemakaian: node scripts/db/local.mjs [start|stop|reset|status]
//   start  menyalakan server di latar belakang (port 54329), membuat database "tooday" bila belum ada
//   stop   mematikan server
//   reset  mematikan, menghapus data lokal, lalu menyalakan ulang dari kosong
// Memakai pg_ctl karena di Windows pg_ctl menurunkan hak admin yang ditolak postgres.exe.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";

const mode = process.argv[2] ?? "start";
// Data di luar folder project: file WAL yang terus berubah akan memicu watcher `next dev`.
const root = path.resolve(process.env.LOCAL_PG_DIR ?? path.join(os.homedir(), ".tooday"));
const dataDir = path.join(root, "pg");
const logFile = path.join(root, "pg.log");
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);

const platformPackage = {
  win32: "@embedded-postgres/windows-x64",
  linux: "@embedded-postgres/linux-x64",
  darwin: process.arch === "arm64" ? "@embedded-postgres/darwin-arm64" : "@embedded-postgres/darwin-x64",
}[process.platform];
const { pg_ctl, initdb } = await import(platformPackage);

const run = (bin, args) => execFileSync(bin, args, { stdio: "pipe" }).toString();
const running = () => {
  try {
    run(pg_ctl, ["status", "-D", dataDir]);
    return true;
  } catch {
    return false;
  }
};

function stop() {
  if (existsSync(dataDir) && running()) run(pg_ctl, ["stop", "-D", dataDir, "-m", "fast", "-w"]);
}

async function start() {
  if (!existsSync(dataDir)) {
    mkdirSync(path.dirname(dataDir), { recursive: true });
    const pwFile = path.join(root, "pwfile");
    writeFileSync(pwFile, "postgres\n");
    run(initdb, ["-D", dataDir, "-U", "postgres", "--auth=password", `--pwfile=${pwFile}`, "-E", "UTF8", "--locale=C"]);
    rmSync(pwFile);
  }
  if (!running()) {
    // stdio "ignore": proses postgres mewarisi handle output, pipe akan membuat perintah ini menunggu selamanya.
    execFileSync(pg_ctl, ["start", "-D", dataDir, "-l", logFile, "-w", "-o", `-p ${port} -c listen_addresses=127.0.0.1`], {
      stdio: "ignore",
    });
  }

  const admin = postgres(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = 'tooday'`;
  if (!exists) await admin`create database tooday`;
  await admin.end();
  console.log(`Postgres lokal siap: postgres://postgres:postgres@127.0.0.1:${port}/tooday`);
}

if (mode === "stop") stop();
else if (mode === "status") console.log(running() ? "berjalan" : "mati");
else {
  if (mode === "reset") {
    stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
  await start();
}
