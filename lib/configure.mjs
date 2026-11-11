// scripts/configure-public.mjs
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";

// node_modules/@zesia/client/scripts/read-secret.mjs
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
async function readSecret(input, output) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive token entry requires a terminal. Run this command in your terminal, or use --token-file <path>. Do not paste your token into chat.");
  }
  const muted = new Writable({ write(_chunk, _encoding, callback) {
    callback();
  } });
  const prompt = createInterface({ input, output: muted, terminal: true, historySize: 0 });
  output.write("Zesia trial token (hidden; stored only on this computer): ");
  try {
    return await new Promise((resolve, reject) => {
      prompt.once("close", () => reject(new Error("Token entry cancelled. No configuration was saved.")));
      prompt.question("", (value) => resolve(value.trim()));
    });
  } finally {
    prompt.close();
    muted.end();
    output.write("\n");
  }
}

// scripts/configure-public.mjs
var defaultUrl = "https://api.zesia.dev";
var path = process.env.ZESIA_CONFIG || join(homedir(), ".config", "zesia", "dsh.json");
var args = process.argv.slice(2);
var config = {};
try {
  config = JSON.parse(await readFile(path, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw new Error("Could not read the existing DSH configuration.");
}
var storedUrl = config.url?.replace(/\/$/u, "");
var url = process.env.ZESIA_URL || (storedUrl && storedUrl !== "https://zesia-consult.cprindex.workers.dev" ? storedUrl : defaultUrl);
var tokenConfigured = Boolean(process.env.ZESIA_TOKEN || config.token);
if (args.length === 1 && args[0] === "--show") {
  const destination = new URL(url);
  if (destination.username || destination.password) throw new Error("Remove credentials from the service URL.");
  console.log(JSON.stringify({ url: destination.origin, confirmBeforeSend: config.confirmBeforeSend !== false, tokenConfigured }));
} else {
  if (args.length) throw new Error("Run without arguments to activate, or pass --show to check configuration.");
  if (tokenConfigured || url !== defaultUrl) throw new Error("An activation code or custom service is already configured. Existing settings were preserved.");
  const token = await readSecret(stdin, stdout);
  if (!token || /[\s\x00-\x1f\x7f]/u.test(token)) throw new Error("A valid trial token is required.");
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ ...config, url, token, confirmBeforeSend: config.confirmBeforeSend !== false }, null, 2), { mode: 384, flag: "wx" });
  await rename(temp, path);
  await chmod(path, 384);
  console.log("Saved private DSH configuration.");
}
