import { readFileSync } from "node:fs";
import { createServer } from "vite";

function source(file) {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

function mustMatch(file, pattern) {
  if (!pattern.test(source(file))) throw new Error(`${file} does not match ${pattern}`);
}

function mustNot(file, pattern) {
  if (pattern.test(source(file))) throw new Error(`${file} still contains ${pattern}`);
}

mustMatch("./src/reel/reel.ts", /setFighterIdentity\(fighter, "plate"/);
mustMatch("./src/summon/summon.ts", /setFighterIdentity\(fighter, "summon"/);
mustMatch("./src/chat/chat.ts", /setFighterIdentity\(person, "chat"/);
mustNot("./src/reel/reel.ts", /plateName\.textContent|plateJa\.textContent|plateLine\.textContent/);
mustNot("./src/summon/summon.ts", /#summon-(?:name|ja|line)"\)!?\s*\.textContent/);
mustNot("./src/main.ts", /setFighterIdentity|STAR_LAYOUT|function openSummon|function leaveSplash|function makeBall/);
mustNot("./src/main.ts", /plateName\.textContent|plateJa\.textContent|plateLine\.textContent/);
mustNot("./src/main.ts", /#summon-(?:name|ja|line)"\)!?\s*\.textContent/);
const ownGlobals = /^\s*(?:export )?(?:let|const|var) (?:index|drag|balls|summonOpen)\b/m;
for (const file of ["./src/main.ts", "./src/reel/reel.ts", "./src/summon/summon.ts", "./src/splash/splash.ts"]) {
  mustNot(file, ownGlobals);
}
mustMatch("./src/main.ts", /createReel\(state/);
mustMatch("./src/main.ts", /createSummon\(state/);
mustMatch("./src/main.ts", /createSplash\(/);
mustMatch("./src/reel/reel.ts", /state\.index/);
mustMatch("./src/reel/reel.ts", /state\.drag/);
mustMatch("./src/reel/reel.ts", /state\.balls/);
mustMatch("./src/summon/summon.ts", /state\.summonOpen/);
mustNot("./src/chat/chat.ts", /nameEl\.textContent|jaEl\.textContent|kicker\.textContent|portrait\.append/);

const cssFiles = ["./src/style.css", "./src/reel/reel.css", "./src/summon/summon.css", "./src/chat/chat.css"];
for (const file of cssFiles) source(file);
mustMatch("./src/main.ts", /import "\.\/style\.css"/);
mustMatch("./src/main.ts", /import "\.\/reel\/reel\.css"/);
mustMatch("./src/main.ts", /import "\.\/summon\/summon\.css"/);
mustMatch("./src/main.ts", /import "\.\/chat\/chat\.css"/);

function selectorDefinitions(css, selector) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let count = 0;
  for (const match of withoutComments.matchAll(/([^{}@]+)\{/g)) {
    for (const part of match[1].split(",")) {
      if (part.trim() === selector) count += 1;
    }
  }
  return count;
}

function countSelector(selector) {
  return cssFiles.reduce((sum, file) => sum + selectorDefinitions(source(file), selector), 0);
}

for (const selector of [".dball-gloss", ".ring"]) {
  const count = countSelector(selector);
  if (count !== 1) throw new Error(`${selector} is defined ${count} times`);
}

mustMatch("./src/style.css", /:root\s*\{/);
mustMatch("./src/style.css", /\.site\s*\{/);
mustMatch("./src/style.css", /\.splash\s*\{/);
mustMatch("./src/style.css", /\.plate\s*\{/);
mustNot("./src/style.css", /\.reel\b|\.summon\b|\.chat\b|\.dball\b/);
mustMatch("./src/reel/reel.css", /\.reel\s*\{/);
mustMatch("./src/reel/reel.css", /\.dball-gloss\s*\{/);
mustNot("./src/reel/reel.css", /\.summon\b|\.chat\b/);
mustMatch("./src/summon/summon.css", /\.summon\s*\{/);
mustMatch("./src/summon/summon.css", /\.ring\s*\{/);
mustNot("./src/summon/summon.css", /\.reel\b|\.chat\b|\.dball\b/);
mustMatch("./src/chat/chat.css", /\.chat\s*\{/);
mustNot("./src/chat/chat.css", /\.reel\b|\.summon\b|\.dball\b/);
console.log("stylesheet split checks passed");
mustMatch("./src/characters/identity.ts", /export function setFighterIdentity/);
mustMatch("./src/chat/chat.ts", /^function liftCharacter\(/m);
mustMatch("./src/chat/chat.ts", /function bubble\(/);
mustMatch("./src/chat/chat.ts", /function appendMessage[\s\S]*bubble\([\s\S]*function appendPending[\s\S]*bubble\(/);
const bubbleClasses = source("./src/chat/chat.ts").match(/className = "bubble"/g) ?? [];
if (bubbleClasses.length !== 1) {
  throw new Error(`chat.ts sets the bubble class ${bubbleClasses.length} times`);
}

const server = await createServer({
  root: new URL(".", import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

try {
  await server.ssrLoadModule("/src/characters/identity.test.ts");
  console.log("identity tests passed");
  await server.ssrLoadModule("/src/chat/cancel.test.ts");
  console.log("cancel tests passed");
  await server.ssrLoadModule("/src/chat/log.test.ts");
  console.log("log tests passed");
  await server.ssrLoadModule("/src/reel/ball.test.ts");
  console.log("ball tests passed");
} finally {
  await server.close();
}

const reelServer = await createServer({
  root: new URL(".", import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

try {
  await reelServer.ssrLoadModule("/src/reel/reel.test.ts");
  console.log("reel tests passed");
} finally {
  await reelServer.close();
}

const splitServer = await createServer({
  root: new URL(".", import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

try {
  await splitServer.ssrLoadModule("/src/split.test.ts");
  console.log("split tests passed");
} finally {
  await splitServer.close();
}
