import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  Body1, Button, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, Field, Input, Spinner, Subtitle2,
} from "@fluentui/react-components";
import { BarcodeScannerRegular } from "@fluentui/react-icons";
import type { Product } from "@/generated/models/OpenFoodFactsModel";
import { ProductImage } from "@/components/ProductImage";
import { useToast } from "@/hooks/use-toast";
import { linkProductToItem, lookupProduct } from "@/utils/ProductBarcode";
import { errorText } from "@/utils/StockTransactions";
import { useStyles } from "@/styles/BarcodeScanDialog.styles";

export function BarcodeScanDialog({ itemId, currentProductId, onLinked }: {
  itemId: string;
  currentProductId?: string;
  onLinked: () => Promise<void>;
}) {
  const styles = useStyles();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product>();
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraPaused, setCameraPaused] = useState(false);
  const [looking, setLooking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const busy = useRef(false);
  const requestId = useRef(0);
  const linked = useRef(false);

  const lookup = useCallback(async (value: string) => {
    if (busy.current) return;
    if (!value.trim()) {
      setError("Enter a barcode");
      return;
    }
    busy.current = true;
    setCameraPaused(true);
    const current = ++requestId.current;
    setBarcode(value.trim());
    setLooking(true);
    setProduct(undefined);
    setError("");
    try {
      const found = await lookupProduct(value);
      if (current === requestId.current) setProduct(found);
    } catch (err) {
      if (current === requestId.current) setError(errorText(err));
    } finally {
      if (current === requestId.current) {
        busy.current = false;
        setLooking(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || !video || cameraPaused) return;
    let disposed = false;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserMultiFormatReader();
    void reader.decodeFromConstraints(
      { video: { facingMode: { ideal: "environment" } }, audio: false },
      video,
      (result, _, scanner) => {
        if (disposed || !result || busy.current) return;
        scanner.stop();
        void lookup(result.getText());
      },
    ).then((scanner) => {
      controls = scanner;
      if (disposed) scanner.stop();
    }).catch((err: unknown) => {
      if (!disposed) setCameraError(`Camera unavailable: ${errorText(err)}. Type the barcode below.`);
    });
    return () => {
      disposed = true;
      controls?.stop();
    };
  }, [open, video, cameraPaused, lookup]);

  useEffect(() => () => { requestId.current++; }, []);

  const close = () => {
    if (busy.current && linking) return;
    requestId.current++;
    busy.current = false;
    setLooking(false);
    setProduct(undefined);
    setBarcode("");
    setError("");
    setCameraError("");
    setOpen(false);
  };

  const link = async () => {
    if (!product || busy.current) return;
    busy.current = true;
    setLinking(true);
    setError("");
    try {
      const result = await linkProductToItem(itemId, product);
      linked.current = true;
      if (result.imageError) {
        toast.error(`Product linked, but its image failed to save: ${result.imageError}`);
      } else {
        toast.success("Product linked to item");
      }
      await onLinked();
      busy.current = false;
      setLinking(false);
      close();
    } catch (err) {
      setError(linked.current
        ? `Product linked, but refreshing the item failed: ${errorText(err)}`
        : `Failed to link product: ${errorText(err)}`);
    } finally {
      busy.current = false;
      setLinking(false);
    }
  };

  return (
    <>
      <Button icon={<BarcodeScannerRegular />} data-testid="scan-barcode-button" onClick={() => {
        linked.current = false;
        setCameraPaused(false);
        setOpen(true);
      }}>
        {currentProductId ? "Rescan Barcode" : "Scan Barcode"}
      </Button>
      <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) close(); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Scan Product Barcode</DialogTitle>
            <DialogContent className={styles.content}>
              <video ref={setVideo} className={styles.video} autoPlay muted playsInline aria-label="Barcode camera" />
              {cameraError && <Body1 role="status">{cameraError}</Body1>}
              <form onSubmit={(event) => { event.preventDefault(); void lookup(barcode); }}>
                <Field label="Barcode">
                  <Input value={barcode} inputMode="numeric" data-testid="scan-ean-input"
                    disabled={looking || linking}
                    onChange={(_, data) => { setBarcode(data.value); setProduct(undefined); setError(""); }} />
                </Field>
                <Button type="submit" disabled={looking || linking} data-testid="scan-lookup-button">Look Up</Button>
              </form>
              {looking && <Spinner size="small" label="Looking up product" />}
              {error && <Body1 role="alert">{error}</Body1>}
              {product && (
                <Card className={styles.product}>
                  <Subtitle2>{product.name || product.ean}</Subtitle2>
                  <Body1>{[product.brand, product.quantity].filter(Boolean).join(" - ")}</Body1>
                  <ProductImage imageUrl={product.imageUrl} name={product.name || product.ean || "Product"} />
                </Card>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={close} disabled={linking}>Cancel</Button>
              <Button appearance="primary" disabled={!product || looking || linking || linked.current}
                data-testid="scan-link-button" onClick={() => void link()}>
                {linking ? "Linking..." : "Link to Item"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
