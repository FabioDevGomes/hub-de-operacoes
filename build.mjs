import { cp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const manifestPath = process.argv[2];

const emptyManifest = { schema: "manifesto_mcc_v1", separacao_temporal: { D_menos_1: { datas_detectadas: [] }, D_zero: { datas_detectadas: [] } }, campanhas: [] };
const [template, databaseModule, productCatalogModule, viewRegistryModule, rawManifest] = await Promise.all([
  readFile(resolve(root, "src/index.template.html"), "utf8"),
  readFile(resolve(root, "src/database.js"), "utf8"),
  readFile(resolve(root, "src/product-catalog.js"), "utf8"),
  readFile(resolve(root, "src/view-registry.js"), "utf8"),
  manifestPath ? readFile(resolve(manifestPath), "utf8") : Promise.resolve(JSON.stringify(emptyManifest)),
]);
const manifest = JSON.parse(rawManifest);
const embedded = JSON.stringify(manifest).replaceAll("</script", "<\\/script");
const database = databaseModule.replaceAll("</script", "<\\/script");
const productCatalog = productCatalogModule.replaceAll("</script", "<\\/script");
const viewRegistry = viewRegistryModule.replaceAll("</script", "<\\/script");
const output = template.replace("__DATABASE_MODULE__", database).replace("__PRODUCT_CATALOG_MODULE__", productCatalog).replace("__VIEW_REGISTRY_MODULE__", viewRegistry).replace("__EMBEDDED_MANIFEST__", embedded);
const faviconBase64 = template.match(/<link rel="icon" type="image\/png" href="data:image\/png;base64,([^"]+)"/)?.[1];
if (!faviconBase64) throw new Error("Favicon do painel não encontrado no template.");
await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/index.html"), output, "utf8");
await writeFile(resolve(root, "dist/database.js"), databaseModule, "utf8");
await writeFile(resolve(root, "dist/favicon.png"), Buffer.from(faviconBase64, "base64"));
await cp(resolve(root, "src/brand-logo.png"), resolve(root, "dist/brand-logo.png"));
await cp(resolve(root, "src/flowtracking-copy-guide.png"), resolve(root, "dist/flowtracking-copy-guide.png"));
await cp(resolve(root, "src/overview-info-icon.png"), resolve(root, "dist/overview-info-icon.png"));
await cp(resolve(root, "src/sidebar-component.js"), resolve(root, "dist/sidebar-component.js"));
await cp(resolve(root, "src/sidebar-component.css"), resolve(root, "dist/sidebar-component.css"));
await cp(resolve(root, "src/table-headers.css"), resolve(root, "dist/table-headers.css"));
await cp(resolve(root, "src/overview-domain.js"), resolve(root, "dist/overview-domain.js"));
await cp(resolve(root, "src/curadoria"), resolve(root, "dist/curadoria"), { recursive: true });
await cp(resolve(root, "src/meu-tempo"), resolve(root, "dist/meu-tempo"), { recursive: true });
await cp(resolve(root, "src/copy-ficha"), resolve(root, "dist/copy-ficha"), { recursive: true });
await cp(resolve(root, "src/presell"), resolve(root, "dist/presell"), { recursive: true });
await cp(resolve(root, "src/asset-studio"), resolve(root, "dist/asset-studio"), { recursive: true });
await cp(resolve(root, "src/control-macro"), resolve(root, "dist/control-macro"), { recursive: true });
await cp(resolve(root, "src/accounts"), resolve(root, "dist/accounts"), { recursive: true });
await cp(resolve(root, "src/billing"), resolve(root, "dist/billing"), { recursive: true });
await cp(resolve(root, "src/personal-finance"), resolve(root, "dist/personal-finance"), { recursive: true });
await cp(resolve(root, "src/legacy-totais-migration.mjs"), resolve(root, "dist/legacy-totais-migration.mjs"));
// Personal operational payloads belong only to browser IndexedDB or data-local/.
// Remove stale copies so a build can never republish data left by an older version.
for (const privateArtifact of [
  "dist/billing/seed-v1.json",
  "dist/campaign-snapshot-seed.json",
  "dist/__paused-history-source.json",
]) await rm(resolve(root, privateArtifact), { force: true });
const legacyTotalsSeed = resolve(root, "data-local/legacy-totais-migration-v1.json");
const legacyTotalsSeedOutput = resolve(root, "dist/legacy-totais-migration-v1.json");
try {
  await cp(legacyTotalsSeed, legacyTotalsSeedOutput);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await rm(legacyTotalsSeedOutput, { force: true });
}
