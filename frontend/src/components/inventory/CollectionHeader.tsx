import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { useTcgResource } from "../../hooks/useTcgResource";
import { fetchInventory, InventoryError } from "../../services/inventory";
import { ValueTotal } from "../prices/CollectionValue";
import { CurrencySwitch, RatesAttribution, ReferenceNote } from "../prices/PriceDisplay";
import { useCollectionValuation } from "../prices/useCollectionValuation";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";

/** Whole-collection figures: filters below never change the meaning of these totals. */
export function CollectionHeader() {
  const { dictionary } = useLocale();
  const { retrySession } = useAuth();
  const text = dictionary.inventory;
  const request = useCallback((signal: AbortSignal) => fetchInventory({ offset: 0, card_id: "", condition: "", language: "", variant: "" }, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof InventoryError && error.status === 401) retrySession();
    throw error;
  }), [retrySession]);
  const counts = useTcgResource("collection-counts", request);
  const value = useCollectionValuation();
  return <section className="pv-collection-header" aria-label={text.summaryLabel}>
    <div className="pv-collection-header__heading"><h1 id="collection-title">{text.title}</h1><CurrencySwitch /></div>
    <p className="inventory-hint">{text.summaryLabel}</p>
    {counts.state.kind === "loading" && <LoadingStatus label={text.loading}><Skeleton shape="text" lines={2} /></LoadingStatus>}
    {counts.state.kind === "error" && <InlineError calm message={text.loadError} retryLabel={text.summaryRetry} onRetry={counts.retry} />}
    {counts.state.kind === "loaded" && <dl className="pv-collection-header__counts">
      <div><dt>{text.copyCountLabel}</dt><dd>{counts.state.data.total}</dd></div>
      <div><dt>{text.distinctLabel}</dt><dd>{Object.keys(counts.state.data.quantities).length}</dd></div>
    </dl>}
    <div className="pv-collection-header__value" aria-label={dictionary.prices.collectionValue}>
      {value.state.kind === "loading" && <LoadingStatus label={dictionary.prices.loading}><Skeleton shape="number" /><Skeleton shape="text" lines={2} /></LoadingStatus>}
      {value.state.kind === "error" && <InlineError calm message={text.valueError} retryLabel={text.valueRetry} onRetry={value.retry} />}
      {value.state.kind === "loaded" && <><ValueTotal value={value.state.data} />
        {value.state.data.pending_count > 0 && <p className="price-meta">{dictionary.prices.pending.replace("{count}", String(value.state.data.pending_count))} <button type="button" onClick={value.retry}>{dictionary.prices.retry}</button></p>}
        {value.state.data.total !== null && value.state.data.priced_count > 0 && <RatesAttribution rates={value.state.data.rates} />}
      </>}
    </div>
    <ReferenceNote />
  </section>;
}
