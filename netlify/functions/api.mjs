import { getStore } from "@netlify/blobs";
import { randomBytes, scryptSync, timingSafeEqual, createHmac, randomUUID } from "node:crypto";

export const config = { path: "/api/*" };

const store = getStore({ name: "mdt", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const fail = (status, error) => json({ error }, status);
const clean = (s, max) => String(s ?? "").trim().slice(0, max);
const load = async (key, def) => (await store.get(key, { type: "json" })) ?? def;
const save = (key, val) => store.setJSON(key, val);

/* ---------- Sécurité : mots de passe et jetons ---------- */
async function secret() {
  if (process.env.MDT_SECRET) return process.env.MDT_SECRET;
  let s = await store.get("secret");
  if (!s) {
    s = randomBytes(32).toString("hex");
    await store.set("secret", s);
  }
  return s;
}
const hashPw = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 64).toString("hex");
};
const checkPw = (pw, stored) => {
  const [salt, h] = String(stored).split(":");
  const test = scryptSync(pw, salt, 64);
  const real = Buffer.from(h, "hex");
  return test.length === real.length && timingSafeEqual(test, real);
};
async function sign(username) {
  const p = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 12 * 3600 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", await secret()).update(p).digest("base64url");
  return p + "." + sig;
}
async function verify(token) {
  const [p, sig] = String(token || "").split(".");
  if (!p || !sig) return null;
  const good = createHmac("sha256", await secret()).update(p).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.exp > Date.now() ? d.u : null;
  } catch {
    return null;
  }
}

const pub = (u) => ({
  id: u.id, username: u.username, admin: !!u.admin, approved: !!u.approved,
  created: u.created, lastLogin: u.lastLogin || null,
});

async function auth(req) {
  const name = await verify((req.headers.get("authorization") || "").replace(/^Bearer /, ""));
  if (!name) return null;
  const users = await load("users", {});
  const u = users[name];
  return u ? { u, users } : null;
}

const MAX_FAILS = 5, LOCK_MS = 60 * 1000;

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const seg = path.split("/").filter(Boolean);
  const method = req.method;
  let body = {};
  if (method !== "GET" && method !== "DELETE") {
    try { body = await req.json(); } catch { body = {}; }
  }

  try {
    /* ---------- Comptes : inscription / connexion ---------- */
    if (method === "POST" && path === "/signup") {
      const username = clean(body.username, 24).toLowerCase();
      const password = String(body.password ?? "");
      if (username.length < 3 || !/^[a-z0-9_.-]+$/.test(username))
        return fail(400, "Nom d'utilisateur : 3 à 24 caractères (lettres, chiffres, _ . -).");
      if (password.length < 6 || password.length > 72)
        return fail(400, "Le mot de passe doit contenir entre 6 et 72 caractères.");
      const users = await load("users", {});
      if (users[username]) return fail(409, "Ce nom d'utilisateur est déjà pris.");
      const first = Object.keys(users).length === 0;
      users[username] = {
        id: randomUUID(), username, hash: hashPw(password),
        admin: first, approved: first, created: Date.now(), lastLogin: Date.now(),
      };
      await save("users", users);
      return json({ token: await sign(username), user: pub(users[username]) });
    }

    if (method === "POST" && path === "/login") {
      const username = clean(body.username, 24).toLowerCase();
      const password = String(body.password ?? "");
      const users = await load("users", {});
      const u = users[username];
      if (u && u.lockedUntil && u.lockedUntil > Date.now())
        return fail(429, `Trop d'essais. Réessayez dans ${Math.ceil((u.lockedUntil - Date.now()) / 1000)} s.`);
      if (!u || !checkPw(password, u.hash)) {
        if (u) {
          u.fails = (u.fails || 0) + 1;
          if (u.fails >= MAX_FAILS) { u.fails = 0; u.lockedUntil = Date.now() + LOCK_MS; }
          await save("users", users);
        }
        return fail(401, "Identifiants incorrects.");
      }
      u.fails = 0; u.lockedUntil = 0; u.lastLogin = Date.now();
      await save("users", users);
      return json({ token: await sign(username), user: pub(u) });
    }

    /* ---------- Tout le reste exige une connexion ---------- */
    const session = await auth(req);
    if (!session) return fail(401, "Session expirée. Reconnectez-vous.");
    const { u: me, users } = session;

    if (method === "GET" && path === "/me") return json({ user: pub(me) });

    if (!me.approved) return fail(403, "Compte en attente de validation par un administrateur.");

    /* ---------- Administration des comptes ---------- */
    if (seg[0] === "accounts") {
      if (!me.admin) return fail(403, "Réservé aux administrateurs.");
      if (method === "GET" && seg.length === 1) {
        const q = clean(url.searchParams.get("q"), 50).toLowerCase();
        const rows = Object.values(users)
          .filter((x) => !q || x.username.includes(q))
          .sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0))
          .map(pub);
        return json({ accounts: rows });
      }
      const target = Object.values(users).find((x) => x.id === seg[1]);
      if (!target) return fail(404, "Compte introuvable.");
      if (target.id === me.id) return fail(400, "Action impossible sur votre propre compte.");
      if (method === "POST" && seg[2] === "approve") target.approved = true;
      else if (method === "POST" && seg[2] === "revoke") target.approved = false;
      else if (method === "DELETE" && seg.length === 2) delete users[target.username];
      else return fail(404, "Route inconnue.");
      await save("users", users);
      return json({ ok: true });
    }

    /* ---------- Tableau de bord ---------- */
    if (method === "GET" && path === "/dashboard") {
      const [warrants, reports] = await Promise.all([load("warrants", []), load("reports", [])]);
      return json({ warrants: warrants.slice(0, 50), reports: reports.slice(0, 30) });
    }

    /* ---------- Citoyens et casier ---------- */
    if (seg[0] === "citizens") {
      const list = await load("citizens", []);
      if (method === "GET") {
        const q = clean(url.searchParams.get("q"), 50).toLowerCase();
        return json({ citizens: list.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 50) });
      }
      if (method === "POST") {
        const name = clean(body.name, 100);
        if (name.length < 2) return fail(400, "Nom du citoyen obligatoire.");
        const c = { id: randomUUID(), name, dob: clean(body.dob, 30), notes: clean(body.notes, 1000), by: me.username, created: Date.now() };
        list.unshift(c);
        await save("citizens", list);
        return json({ citizen: c });
      }
    }

    if (seg[0] === "records") {
      const list = await load("records", []);
      if (method === "GET") {
        const id = clean(url.searchParams.get("citizen"), 60);
        return json({ records: list.filter((r) => r.citizen === id).slice(0, 50) });
      }
      if (method === "POST") {
        const types = ["amende", "arrestation", "note"];
        const title = clean(body.title, 120);
        const citizen = clean(body.citizen, 60);
        if (!title || !citizen) return fail(400, "Motif obligatoire.");
        const r = {
          id: randomUUID(), citizen, type: types.includes(body.type) ? body.type : "note", title,
          amount: Math.max(0, Math.min(Number(body.amount) || 0, 1000000)),
          details: clean(body.details, 2000), author: me.username, created: Date.now(),
        };
        list.unshift(r);
        await save("records", list);
        return json({ record: r });
      }
    }

    /* ---------- Véhicules ---------- */
    if (seg[0] === "vehicles") {
      const list = await load("vehicles", []);
      if (method === "GET") {
        const q = clean(url.searchParams.get("q"), 20).toLowerCase();
        return json({ vehicles: list.filter((v) => !q || v.plate.toLowerCase().includes(q)).slice(0, 50) });
      }
      if (method === "POST") {
        const plate = clean(body.plate, 12).toUpperCase();
        if (plate.length < 2) return fail(400, "Plaque obligatoire.");
        if (list.some((v) => v.plate === plate)) return fail(409, "Cette plaque existe déjà.");
        const v = { id: randomUUID(), plate, owner: clean(body.owner, 100), model: clean(body.model, 60), by: me.username, created: Date.now() };
        list.unshift(v);
        await save("vehicles", list);
        return json({ vehicle: v });
      }
    }

    /* ---------- Rapports ---------- */
    if (seg[0] === "reports") {
      const list = await load("reports", []);
      if (method === "GET") {
        const q = clean(url.searchParams.get("q"), 50).toLowerCase();
        return json({ reports: list.filter((r) => !q || (r.title + " " + r.content).toLowerCase().includes(q)).slice(0, 30) });
      }
      if (method === "POST") {
        const title = clean(body.title, 120), content = clean(body.content, 4000);
        if (!title || !content) return fail(400, "Titre et contenu obligatoires.");
        const r = { id: randomUUID(), title, content, author: me.username, created: Date.now() };
        list.unshift(r);
        await save("reports", list);
        return json({ report: r });
      }
    }

    /* ---------- Avis de recherche ---------- */
    if (seg[0] === "warrants") {
      const list = await load("warrants", []);
      if (method === "GET") return json({ warrants: list.slice(0, 50) });
      if (method === "POST") {
        const name = clean(body.name, 100), reason = clean(body.reason, 1000);
        if (!name || !reason) return fail(400, "Nom et motif obligatoires.");
        const w = { id: randomUUID(), name, reason, author: me.username, created: Date.now() };
        list.unshift(w);
        await save("warrants", list);
        return json({ warrant: w });
      }
      if (method === "DELETE" && seg[1]) {
        if (!me.admin) return fail(403, "Seul un administrateur peut lever un avis.");
        await save("warrants", list.filter((w) => w.id !== seg[1]));
        return json({ ok: true });
      }
    }

    return fail(404, "Route inconnue.");
  } catch (e) {
    console.error(e);
    return fail(500, "Erreur serveur.");
  }
};
