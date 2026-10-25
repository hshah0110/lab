import { useQuery } from "@tanstack/react-query";
import { Body1, Spinner } from "@fluentui/react-components";
import { loadProductImage } from "@/utils/ProductBarcode";
import { errorText } from "@/utils/StockTransactions";
import { useStyles } from "@/styles/BarcodeScanDialog.styles";

export function ProductImage({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const styles = useStyles();
  const { data, isLoading, error } = useQuery({
    queryKey: ["productImage", imageUrl],
    queryFn: () => loadProductImage(imageUrl!),
    enabled: !!imageUrl,
    retry: false,
  });
  if (!imageUrl) return <Body1>No product image available.</Body1>;
  if (isLoading) return <Spinner size="small" label="Loading product image" />;
  if (error) return <Body1 role="status">Image unavailable: {errorText(error)}</Body1>;
  return data ? <img className={styles.image} src={data.dataUrl} alt={name} /> : null;
}
