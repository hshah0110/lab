import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/ProductBarcode.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ok = (data) => ({ success: true, data });
const fail = (message) => ({ success: false, error: { message } });
const jpeg = new Uint8Array([255, 216, 255, 217]);

function setup(overrides = {}) {
  const calls = [];
  const productService = {
    getAll: async (options) => { calls.push(["find", options]); return ok([]); },
    create: async (record) => { calls.push(["create", record]); return ok({ lab_productid: "new-product" }); },
    ...overrides.products,
  };
  const itemService = {
    update: async (...args) => { calls.push(["link", ...args]); return ok({}); },
    ...overrides.items,
  };
  const connector = {
    GetProductByBarcode: async (ean) => ok({ ean, name: "Nutella" }),
    GetProductImage: async () => { calls.push(["image"]); return ok(btoa(String.fromCharCode(...jpeg))); },
    ...overrides.connector,
  };
  const client = {
    uploadFileToRecord: async (...args) => { calls.push(["upload", ...args]); return ok(); },
    ...overrides.client,
  };
  const modules = {
    "@microsoft/power-apps/data": { getClient: () => client },
    "../../.power/schemas/appschemas/dataSourcesInfo": { dataSourcesInfo: {} },
    "@/generated/services/Lab_productsService": { Lab_productsService: productService },
    "@/generated/services/Lab_warehouseitemsService": { Lab_warehouseitemsService: itemService },
    "@/generated/services/OpenFoodFactsService": { OpenFoodFactsService: connector },
    "@/utils/ServicePayload": {
      servicePayload: (record) => record,
      serviceResult: async (call) => {
        const result = await call;
        if (!result.success) throw new Error(result.error.message);
        return result;
      },
    },
    "@/utils/StockTransactions": { errorText: (error) => String(error).replace(/^Error:\s*/, "") },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: (id) => {
      assert.ok(id in modules, `Unexpected import ${id}`);
      return modules[id];
    },
    Uint8Array, ArrayBuffer, Blob, atob, btoa,
  });
  return { ...exports, calls };
}

test("typed/scanned lookup trims the barcode and previews Nutella", async () => {
  const api = setup();
  assert.equal((await api.lookupProduct(" 3017620422003 ")).name, "Nutella");
  assert.equal((await api.lookupProduct(" 3017620422003 ")).ean, "3017620422003");
  await assert.rejects(api.lookupProduct(" "), /Enter a barcode/);
});

test("unknown product has the exact required message; other failures stay distinct", async () => {
  const missing = setup({ connector: { GetProductByBarcode: async () =>
    fail('{"message":"No product found for this barcode"}') } });
  await assert.rejects(missing.lookupProduct("000"), { message: "No product found for this barcode" });
  const denied = setup({ connector: { GetProductByBarcode: async () => fail("Permission denied") } });
  await assert.rejects(denied.lookupProduct("123"), /Permission denied/);
});

test("missing connector data is not treated as success", async () => {
  const api = setup({ connector: { GetProductByBarcode: async () => ok() } });
  await assert.rejects(api.lookupProduct("123"), /no product data/);
});

test("creates exact Product metadata then links then uploads File bytes", async () => {
  const api = setup();
  const product = { ean: "3017620422003", name: "Nutella", brand: "Ferrero",
    quantity: "400 g", imageUrl: "https://images.openfoodfacts.org/test.jpg" };
  const before = Date.now();
  const result = await api.linkProductToItem("item-id", product);
  assert.equal(result.productId, "new-product");
  assert.equal(result.imageError, undefined);
  assert.deepEqual(api.calls.map(([operation]) => operation), ["find", "create", "link", "image", "upload"]);
  const record = api.calls[1][1];
  assert.equal(record.lab_name, "Nutella");
  assert.equal(record.lab_ean, product.ean);
  assert.equal(record.lab_brand, product.brand);
  assert.equal(record.lab_quantity, product.quantity);
  assert.equal(record.lab_imageurl, product.imageUrl);
  assert.ok(Date.parse(record.lab_lastsyncedon) >= before);
  assert.equal(api.calls[2][1], "item-id");
  assert.equal(api.calls[2][2]["lab_productid@odata.bind"], "/lab_products(new-product)");
  assert.deepEqual(api.calls[4].slice(1, 5), ["lab_products", "new-product", "lab_productimage", "3017620422003.jpg"]);
  assert.deepEqual(api.calls[4][5], jpeg);
});

test("existing EAN is reused without creating a duplicate", async () => {
  const api = setup({ products: { getAll: async () => ok([{ lab_productid: "existing" }]) } });
  const result = await api.linkProductToItem("item", { ean: "3017620422003", name: "Nutella" });
  assert.equal(result.productId, "existing");
  assert.deepEqual(api.calls.map(([operation]) => operation), ["link"]);
});

test("EAN filter escapes quotes and missing product name uses EAN", async () => {
  const api = setup();
  await api.linkProductToItem("item", { ean: "12'34" });
  assert.equal(api.calls[0][1].filter, "lab_ean eq '12''34'");
  assert.equal(api.calls[1][1].lab_name, "12'34");
});

test("host returning no create ID is resolved by EAN", async () => {
  let queries = 0;
  const api = setup({ products: {
    getAll: async () => ok(queries++ ? [{ lab_productid: "saved" }] : []),
    create: async () => ok(),
  } });
  assert.equal((await api.linkProductToItem("item", { ean: "123" })).productId, "saved");
  assert.equal(queries, 2);
});

test("unresolved created record never links an undefined ID", async () => {
  const api = setup({ products: { create: async () => ok() } });
  await assert.rejects(api.linkProductToItem("item", { ean: "123" }), /Could not resolve/);
  assert.equal(api.calls.some(([op]) => op === "link"), false);
});

test("create or link failures stop subsequent operations", async () => {
  const createFailed = setup({ products: { create: async () => fail("Create denied") } });
  await assert.rejects(createFailed.linkProductToItem("item", { ean: "123" }), /Create denied/);
  assert.equal(createFailed.calls.some(([op]) => op === "link"), false);
  const linkFailed = setup({ items: { update: async () => fail("Link denied") } });
  await assert.rejects(linkFailed.linkProductToItem("item", { ean: "123", imageUrl: "image" }), /Link denied/);
  assert.equal(linkFailed.calls.some(([op]) => op === "image"), false);
});

test("image upload failure preserves successful link and reports warning", async () => {
  const api = setup({ client: { uploadFileToRecord: async () => fail("File denied") } });
  const result = await api.linkProductToItem("item", { ean: "123", imageUrl: "image" });
  assert.equal(result.productId, "new-product");
  assert.equal(result.imageError, "File denied");
  assert.ok(api.calls.some(([op]) => op === "link"));
});

test("image download failure also preserves link and reports warning", async () => {
  const api = setup({ connector: { GetProductImage: async () => fail("Image unavailable") } });
  const result = await api.linkProductToItem("item", { ean: "123", imageUrl: "image" });
  assert.equal(result.imageError, "Image unavailable");
  assert.ok(api.calls.some(([op]) => op === "link"));
  assert.equal(api.calls.some(([op]) => op === "upload"), false);
});

test("supports binary envelopes, PNG and CSP-safe data URLs; rejects invalid images", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const data of [png, png.buffer, new Blob([png]), { $content: btoa(String.fromCharCode(...png)) }]) {
    const api = setup({ connector: { GetProductImage: async () => ok(data) } });
    const image = await api.loadProductImage("image");
    assert.equal(image.extension, "png");
    assert.ok(image.dataUrl.startsWith("data:image/png;base64,"));
    assert.deepEqual(image.bytes, png);
  }
  for (const data of [undefined, {}, "not base64!", btoa("<html>error</html>")]) {
    const api = setup({ connector: { GetProductImage: async () => ok(data) } });
    await assert.rejects(api.loadProductImage("image"));
  }
});
