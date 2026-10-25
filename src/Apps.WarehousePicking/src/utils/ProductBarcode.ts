import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { Lab_productsService } from "@/generated/services/Lab_productsService";
import { Lab_warehouseitemsService } from "@/generated/services/Lab_warehouseitemsService";
import { OpenFoodFactsService } from "@/generated/services/OpenFoodFactsService";
import type { Product } from "@/generated/models/OpenFoodFactsModel";
import { servicePayload, serviceResult } from "@/utils/ServicePayload";
import { errorText } from "@/utils/StockTransactions";

export async function lookupProduct(barcode: string): Promise<Product> {
  const ean = barcode.trim();
  if (!ean) throw new Error("Enter a barcode");
  const result = await OpenFoodFactsService.GetProductByBarcode(ean);
  if (!result.success) {
    const message = result.error?.message ?? "Product lookup failed";
    if (message.includes("No product found for this barcode")) {
      throw new Error("No product found for this barcode");
    }
    throw new Error(message);
  }
  if (!result.data) throw new Error("The connector returned no product data");
  return { ...result.data, ean: result.data.ean || ean };
}

export async function loadProductImage(imageUrl: string): Promise<{ bytes: Uint8Array; dataUrl: string; extension: string }> {
  const result = await serviceResult(OpenFoodFactsService.GetProductImage(imageUrl));
  const data: unknown = result.data;
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (data instanceof Blob) {
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const encoded = typeof data === "string" ? data
      : data && typeof data === "object" && "$content" in data && typeof data.$content === "string"
        ? data.$content : undefined;
    if (!encoded) throw new Error("The connector returned an unsupported image response");
    const binary = atob(encoded.replace(/^data:[^,]*;base64,/, ""));
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new Error("The connector did not return a JPEG or PNG image");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const mime = png ? "image/png" : "image/jpeg";
  return { bytes, dataUrl: `data:${mime};base64,${btoa(binary)}`, extension: png ? "png" : "jpg" };
}

export async function linkProductToItem(itemId: string, product: Product): Promise<{ productId: string; imageError?: string }> {
  const ean = product.ean?.trim();
  if (!ean) throw new Error("The product has no barcode");
  const options = {
    select: ["lab_productid"],
    filter: `lab_ean eq '${ean.replace(/'/g, "''")}'`,
    top: 1,
  };
  const existing = await serviceResult(Lab_productsService.getAll(options));
  let productId = existing.data?.[0]?.lab_productid;
  if (!productId) {
    const created = await serviceResult(Lab_productsService.create(servicePayload({
      lab_name: product.name || ean,
      lab_ean: ean,
      lab_brand: product.brand,
      lab_quantity: product.quantity,
      lab_imageurl: product.imageUrl,
      lab_lastsyncedon: new Date().toISOString(),
    })));
    productId = created.data?.lab_productid;
    if (!productId) {
      const saved = await serviceResult(Lab_productsService.getAll(options));
      productId = saved.data?.[0]?.lab_productid;
    }
  }
  if (!productId) throw new Error("Could not resolve the saved Product record");

  await serviceResult(Lab_warehouseitemsService.update(itemId, servicePayload({
    "lab_productid@odata.bind": `/lab_products(${productId})`,
  })));

  // The link has already succeeded; image failures must not undo it.
  if (product.imageUrl) {
    try {
      const image = await loadProductImage(product.imageUrl);
      await serviceResult(getClient(dataSourcesInfo).uploadFileToRecord(
        "lab_products", productId, "lab_productimage", `${ean}.${image.extension}`, image.bytes,
      ));
    } catch (error) {
      return { productId, imageError: errorText(error) };
    }
  }
  return { productId };
}
