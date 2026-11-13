// token-service/scripts/ssa-claus.mjs
// Ajuda per al bot (Secure Service Account). S'executa EN LOCAL (Codespace), mai a Render.
//
//   Llistar els comptes de servei (per veure el Service ID de taulamaster_bot):
//     APS_CLIENT_ID=... APS_CLIENT_SECRET=... node scripts/ssa-claus.mjs llista
//
//   Crear una clau nova per al bot (la clau privada només es mostra UNA vegada):
//     APS_CLIENT_ID=... APS_CLIENT_SECRET=... node scripts/ssa-claus.mjs clau <SERVICE_ID>
//
// NO desis mai la sortida al repositori (és públic): copia-la directament als
// secrets de Render (APS_SSA_ID, APS_SSA_KEY_ID, APS_SSA_PRIVATE_KEY).
// Imprimeix la resposta d'Autodesk tal qual perquè no depenem de noms de camp.

const BASE = "https://developer.api.autodesk.com/authentication/v2";
const id = process.env.APS_CLIENT_ID;
const secret = process.env.APS_CLIENT_SECRET;
if (!id || !secret) {
  console.error("Falten APS_CLIENT_ID i/o APS_CLIENT_SECRET");
  process.exit(1);
}

async function tokenApp(scope) {
  const r = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  if (!r.ok) throw new Error(`Token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

const [, , ordre, serviceId] = process.argv;

if (ordre === "llista") {
  const t = await tokenApp("application:service_account:read");
  const r = await fetch(`${BASE}/service-accounts`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  console.log(r.status, JSON.stringify(await r.json(), null, 2));
} else if (ordre === "clau" && serviceId) {
  const t = await tokenApp("application:service_account_key:write");
  const r = await fetch(`${BASE}/service-accounts/${serviceId}/keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}` },
  });
  console.log(r.status, JSON.stringify(await r.json(), null, 2));
} else {
  console.error("Ús: ssa-claus.mjs llista | ssa-claus.mjs clau <SERVICE_ID>");
  process.exit(1);
}
