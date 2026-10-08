import { cp, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { copyPublicDirectory, isolatePrivateDistributionFiles } from './scripts/distribution-privacy.mjs';

const root = resolve(import.meta.dirname);
if (process.argv.length > 2) throw new Error('O build compartilhável não aceita dados operacionais. Carregue os dados pelo sistema no banco local do usuário.');

const emptyManifest = { schema: "manifesto_mcc_v1", separacao_temporal: { D_menos_1: { datas_detectadas: [] }, D_zero: { datas_detectadas: [] } }, campanhas: [] };
const [template, databaseModule, productCatalogModule, viewRegistryModule] = await Promise.all([
  readFile(resolve(root, "src/index.template.html"), "utf8"),
  readFile(resolve(root, "src/database.js"), "utf8"),
  readFile(resolve(root, "src/product-catalog.js"), "utf8"),
  readFile(resolve(root, "src/view-registry.js"), "utf8"),
]);
const embedded = JSON.stringify(emptyManifest);
const database = databaseModule.replaceAll("</script", "<\\/script");
const productCatalog = productCatalogModule.replaceAll("</script", "<\\/script");
const viewRegistry = viewRegistryModule.replaceAll("</script", "<\\/script");
let output = template.replace("__DATABASE_MODULE__", database).replace("__PRODUCT_CATALOG_MODULE__", productCatalog).replace("__VIEW_REGISTRY_MODULE__", viewRegistry).replace("__EMBEDDED_MANIFEST__", embedded);
output = output.replace("__CONTROL_MACRO_VIEW__", await readFile(resolve(root, "src/control-macro/template.html"), "utf8"));
output = output.replace("__CPA_VIEW__", await readFile(resolve(root, "src/cpa/template.html"), "utf8"));
output = output.replace("__TESTED_PRODUCTS_VIEW__", await readFile(resolve(root, "src/tested-products/template.html"), "utf8"));
output = output.replace("__OVERVIEW_VIEW__", await readFile(resolve(root, "src/overview/template.html"), "utf8"));
output = output.replace("__PRODUCT_DIARY_VIEW__", await readFile(resolve(root, "src/product-diary/template.html"), "utf8"));
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
await cp(resolve(root, "src/navigation-controller.js"), resolve(root, "dist/navigation-controller.js"));
await cp(resolve(root, "src/sidebar-component.css"), resolve(root, "dist/sidebar-component.css"));
await cp(resolve(root, "src/theme-colors.css"), resolve(root, "dist/theme-colors.css"));
await cp(resolve(root, "src/control-surfaces.css"), resolve(root, "dist/control-surfaces.css"));
await cp(resolve(root, "src/white-button.css"), resolve(root, "dist/white-button.css"));
// The popup is an isolated Chrome origin: package the same canonical finish locally.
await cp(resolve(root, "src/white-button.css"), resolve(root, "extensions/mcc-d0-bridge/white-button.css"));
await cp(resolve(root, "src/input-standard.css"), resolve(root, "dist/input-standard.css"));
await cp(resolve(root, "src/month-navigation.css"), resolve(root, "dist/month-navigation.css"));
await cp(resolve(root, "src/table-headers.css"), resolve(root, "dist/table-headers.css"));
await cp(resolve(root, "src/table-layout.css"), resolve(root, "dist/table-layout.css"));
await cp(resolve(root, "src/table-columns.css"), resolve(root, "dist/table-columns.css"));
await cp(resolve(root, "src/table-columns.mjs"), resolve(root, "dist/table-columns.mjs"));
await cp(resolve(root, "src/table-edit-actions.css"), resolve(root, "dist/table-edit-actions.css"));
await cp(resolve(root, "src/overview-domain.js"), resolve(root, "dist/overview-domain.js"));
// Publish only the canonical page; historical copies are not build inputs.
await mkdir(resolve(root, "dist/preparador-MCC"), { recursive: true });
await cp(resolve(root, "src/preparador-MCC/index.html"), resolve(root, "dist/preparador-MCC/index.html"));
for (const directory of ['curadoria', 'meu-tempo', 'copy-ficha', 'presell', 'asset-studio', 'control-macro', 'accounts', 'cpa', 'tested-products', 'overview', 'product-diary', 'billing', 'storage', 'personal-finance']) {
  await copyPublicDirectory(resolve(root, 'src', directory), resolve(root, 'dist', directory));
}
await cp(resolve(root, "src/legacy-totais-migration.mjs"), resolve(root, "dist/legacy-totais-migration.mjs"));
// Old builds may have left private payloads behind. Preserve those copies outside
// the served/shared package; never read data-local as a distribution input.
const isolated = await isolatePrivateDistributionFiles(root);
if (isolated.length) console.log(`${isolated.length} arquivo(s) privado(s) isolado(s) em data-local/distribution-recovery.`);
