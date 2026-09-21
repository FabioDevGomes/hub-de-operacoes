import { cp, readFile, mkdir, writeFile } from "node:fs/promises";
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
await cp(resolve(root, "src/curadoria"), resolve(root, "dist/curadoria"), { recursive: true });
await cp(resolve(root, "src/meu-tempo"), resolve(root, "dist/meu-tempo"), { recursive: true });
await cp(resolve(root, "src/presell"), resolve(root, "dist/presell"), { recursive: true });
