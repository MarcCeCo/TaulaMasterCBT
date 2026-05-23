// agent/src/add-service-account.ts
// Script d'un sol ús per afegir l'app (service account) com a membre
// del projecte Autodesk Forma via ACC Admin API.
//
// Execució (des de la carpeta agent/):
//   bun run add-service-account
//   (o: npx ts-node src/add-service-account.ts)
//
// Requisits al .env:
//   APS_CLIENT_ID, APS_CLIENT_SECRET, APS_HUB_ID, APS_PROJECT_ID

const APS_BASE     = "https://developer.api.autodesk.com";
const APS_AUTH_URL = `${APS_BASE}/authentication/v2/token`;

async function obteToken(clientId: string, clientSecret: string, scope: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }).toString(),
  });
  if (!resp.ok) throw new Error(`Error token: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

async function main() {
  const clientId     = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;
  const hubId        = process.env.APS_HUB_ID;
  const projectId    = process.env.APS_PROJECT_ID;

  if (!clientId || !clientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET");
  if (!hubId || !projectId)       throw new Error("Falten APS_HUB_ID o APS_PROJECT_ID");

  // L'account_id és el HUB_ID sense el prefix "b." o "urn:adsk.ace:prod.hub:"
  const accountId = hubId
    .replace("urn:adsk.ace:prod.hub:", "")
    .replace(/^b\./, "");

  // El project_id per a l'Admin API no porta el prefix "b."
  const projectIdNet = projectId.replace(/^b\./, "");

  console.log("🔑 Obtenint token amb scope account:write...");
  const token = await obteToken(clientId, clientSecret, "account:write data:read");
  console.log("✅ Token obtingut\n");

  console.log(`📋 Configuració:`);
  console.log(`   Account ID:  ${accountId}`);
  console.log(`   Project ID:  ${projectIdNet}`);
  console.log(`   Client ID:   ${clientId}`);
  console.log();

  // Afegeix l'app com a service account al projecte
  const url = `${APS_BASE}/hq/v2/accounts/${accountId}/projects/${projectIdNet}/users/import`;

  console.log(`📤 Afegint service account al projecte...`);
  console.log(`   URL: ${url}\n`);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        service_type: "field",
        access_level: "project_member",
        industry_roles: ["Document Manager"],
        company_id: null,
        email: null,
        autodeskId: clientId, // Client ID de l'app com a service account
      }
    ]),
  });

  const text = await resp.text();

  if (resp.ok) {
    console.log("✅ Service account afegit correctament al projecte!");
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  } else {
    console.error(`❌ Error ${resp.status}:`);
    console.error(text);
    console.error("\n💡 Si reps 403, comprova que l'app té el scope 'account:write' activat a APS Portal.");
    console.error("   Si reps 404, l'account_id o project_id pot ser incorrecte.");
  }
}

main().catch(err => { console.error("❌", err.message ?? err); process.exit(1); });
