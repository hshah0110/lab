# Power Apps Template - starter

An opinionated **Vite + TypeScript + React** starter template for building Power Apps code apps.

Designed for common app scenarios, easy extensibility, and minimal setup.

---

## External product data

The app registers `lab_product` through `Lab_productsService` and the Item model
includes the optional `lab_productid` lookup. The `OpenFoodFacts` data source
exposes `OpenFoodFactsService.GetProductByBarcode(barcode)` and
`OpenFoodFactsService.GetProductImage(imageUrl)`.

Deploy `Solutions.DataModel` and `Solutions.Connectors` before binding these
sources. Connections are environment-specific. Resolve the deployed connector's
`name` using `pa connector list --search "Open Food Facts" --json`, create its
connection with `pa connection create`, and bind it with
`pa app add data-source --connector <name> --connection-id <id>`. Pass
`--environment-id <Dev environment id>` to each command while
`power.config.json` has no environment ID. Do not use the Dataverse schema name
`lab_connectorsopenfoodfacts` as the connector ID.

The CLI generates an environment-specific data-source name. Keep the
`OpenFoodFacts` alias consistent in `power.config.json`, `dataSourcesInfo.ts`,
and `OpenFoodFactsService.ts` after regenerating the connector.

### Barcode scanning

Open an item and select **Scan Barcode** (or **Rescan Barcode**). Allow camera
access, or type a barcode and select **Look Up**; manual entry is always available.
For example, `3017620422003` previews Nutella. Select **Link to Item** to reuse a
Product with the same EAN or create one, link it to the item, and then upload its
image to the Product's File column. Image-save errors are reported without
undoing the saved Product or Item link.

The camera uses `@zxing/browser` and stops when the dialog closes or a barcode is
decoded. Camera access requires HTTPS (or localhost) and browser permission.
Images load through `GetProductImage` and render as data URLs to respect the
code app's content security policy.

Run `npm test` for barcode lookup, Product reuse/create, link ordering, image
formats, and partial-failure regression tests.

## Highlights
- **Modern tooling** - Vite, TypeScript, and React
- **Out-of-box styling** - Fluent UI components, light/dark theming and toasts out of the box
- **Dataverse-native controls** - TALXIS base controls (fields, lookups, grid) wired up with a PCF context
- **Batteries included** - Curated libraries pre-wired for common scenarios
- **Standard patterns** - Industry standard patterns and practices
- **Agent friendly** - Optimized for use with coding agents
---

## Pre-installed libraries
- [Fluent UI React v9](https://react.fluentui.dev/) - Microsoft's design system: components, theming (`FluentProvider`), styling (`makeStyles` + design tokens), toasts
- [TALXIS base controls](https://github.com/TALXIS/base-controls) - Dataverse field controls (`TextField`, `Decimal`, `OptionSet`, `Lookup`, `DateTime`, ...) and the `Grid`, with formatting from user settings
- [React Router](https://reactrouter.com/) - pages, routing
- [Zustand](https://zustand.docs.pmnd.rs/) - state management
- [Tanstack Query](https://tanstack.com/query/latest) - data fetching, state management
- [Tanstack Table](https://tanstack.com/table/latest) - interactive tables, datagrids
- [Fluent UI Icons](https://github.com/microsoft/fluentui-system-icons) - icons (`@fluentui/react-icons`)

---

## TALXIS base controls
Base controls are built for the Power Apps Component Framework and read a PCF `context`. The starter's
`PcfProvider` (`src/providers/pcf-provider.tsx`) supplies one through `PcfContextProvider`: a context
generated for a non-PCF host (formatting, user settings, dialogs, ...) carrying the current Fluent v9
theme, so controls follow light/dark mode, plus two surfaces the app answers itself from
`src/providers/pcf-host.ts`:

- `utils.getEntityMetadata` - from the tables you register with `registerEntities()` (a `Lookup`
  needs its target's metadata)
- `navigation.openForm` - navigates to a record's page in the app, from each entity's `formPath`
  (the router registers the navigation with `setHostNavigate`)

```ts
registerEntities({
  logicalName: "tom_warehouseitem",
  displayName: "Warehouse Item",
  primaryIdAttribute: "tom_warehouseitemid",
  primaryNameAttribute: "tom_name",
  formPath: (id) => `/items/${id}`,
})
```

Inside any page, get the context with `usePcfContext()` and pass it to a control:

```tsx
const context = usePcfContext()
<Decimal context={context} parameters={{ value: { raw: qty, type: "Whole.None" } }}
  onNotifyOutputChanged={(o) => typeof o.value !== "string" && setQty(o.value ?? null)} />
```

A control reports a value it can't parse as the raw text (a string), so check the type before storing it.

- **React 18:** base controls (and the AG Grid behind `Grid`) support React up to 18, so the starter
  pins React 18. The `overrides` entry in `package.json` lets base controls, which declare React
  16/17 as their peer range, use the app's React 18.
- **Grid licence:** `Grid` uses AG Grid Enterprise modules. Without a licence key (the `LicenseKey`
  parameter) it runs as an AG Grid trial, with a console notice and a watermark.

---

## Parameters
| Parameter | Required | Description |
|-----------|----------|-------------|
| `DisplayName` | No | Display name shown for the app. |
| `AppName` | Yes | Logical name of the app, without the publisher prefix (e.g. `warehousepicking`). Used as-is for the schema name, the generated `.meta.xml` file name, and the package folder when this project is referenced from a Solution project. Must be unique among all Code Apps referenced by the same solution. |

Example:
```console
dotnet new pp-app-code `
--output "src/CodeApps.WarehousePicking" `
--DisplayName "Warehouse Picking" `
--AppName "warehousepicking"
```
