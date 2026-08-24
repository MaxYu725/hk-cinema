# HK Cinema 共用展示契約

Version: 1（current through cleanup C4）

`app/view-models.js` 是場次及座位來源正規化與共用 UI 之間的展示契約。Broadway、MCL、Emperor、CineArt 及日後註冊的 provider 原始欄位先經 provider adapter 轉換；共用 renderer 不應直接讀取院線原始 JSON。

C3 的首頁 catalogue 契約另由 `app/catalogue-store.js` 及 `app/catalogue-domain.js` 擁有。前者保存 provider snapshot／狀態，後者輸出 `MovieAggregate`、provider match 及 variant group；`multi-provider.js` 只 render domain 輸出，不從 DOM 重建業務資料。

C4 的場次比較契約由 `app/comparison-store.js` 擁有。`provider-compare-v4.js` 發布 selected-date session；filters、sorting 及 Smart Picks 只讀 store record／selector 結果，不從已 render 的文字重建價格、座位、時間或戲院。

## 公開 API

```js
window.HKCinemaViewModels.movie(providerId, movie, detail?)
window.HKCinemaViewModels.showtime(providerId, session)
window.HKCinemaViewModels.seatMap(providerId, seatMap, showtime?)
window.HKCinemaComparisonStore.getState()
window.HKCinemaComparisonStore.selectSessions(options?)
```

Provider ID 由 `provider-registry.js` 決定，目前為 `broadway`、`mcl`、`emperor`、`cineart`；共用程式不得以固定三院線清單作 fallback。輸出分別以 `kind` 標示 `movie-detail`、`showtime`、`seat-map`，並帶有 `schemaVersion: 1`。

`movie-detail` normalizer 仍是可重用資料契約，但 C2 起 production 已沒有 provider-specific 電影詳情 drawer；首頁直接以 `MovieAggregate` 開啟統一場次比較。

## ComparisonSession record

`ComparisonStore.getState()` 固定回傳 `matchId`、`selectedDate`、`sessions`、`filters` 及單調遞增的 `revision`。每個 session 至少包含：

- 識別：`id`／`comparisonId`、`provider`、`sourceId`、`movieSourceId`
- 展示：`providerLabel`、`time`、`cinemaName`、`secondary`、`bookingUrl`
- selector 值：`timeMinutes`、`cinemaKey`、`canonicalCinema`、`region`、`district`
- metadata：`languages`、`subtitles`、`formats`
- 可選證據：`price`、`seats.available`、`seats.total`、`seats.ratio`

`data-comparison-session-id` 只用來把 renderer／enrichment／跳轉操作連回 record，不可用 DOM 文字補回 record 欄位。缺少可靠總座位數時 `seats` 為 `null`；缺少價格時 `price` 為 `null`，兩者均不可轉成 0。

Store filter keys 固定為 `provider`、`language`、`subtitle`、`format`、`region`、`district`、`cinema`、`period`、`price`、`seats`、`sort`。`selectSessions()` 不修改來源 records；它回傳依目前 filter 篩選及排序的拷貝。價格／座位 enrichment 必須以 `comparisonSessionId` 明確 patch 一筆 record，再發出 store revision。

## MovieDetailViewModel

固定欄位：

- `provider`、`id`、`sourceId`、`status`
- `title.zh`、`title.en`、`title.display`、`title.secondary`
- `posterUrl`、`bookingUrl`
- `facts.releaseDate`、`durationMinutes`、`classification`、`category`
- `facts.languages`、`subtitles`、`formats`
- `people.directors`、`people.cast`
- `description`、`trailerUrl`
- `availability.hasFacts`、`hasPeople`、`hasDescription`、`hasTrailer`

缺少資料時使用 `null` 或空陣列；renderer 應隱藏對應欄位，不顯示假資料或大量「未提供」。

## ShowtimeViewModel

固定欄位：

- 場次識別：`provider`、`id`、`sourceId`、`movieId`
- 地點：`cinema`、`house`
- 時間：`date`、`time`、`startAt`、`endAt`
- 場次 metadata：`metadata.formats`、`languages`、`subtitles`
- 票價：`price.currency`、`primary`、`adult`、`student`、`child`、`senior`、`face`、`lowest`、`serviceFee`、`ticketTypes`
- 座位摘要：`seats`
- 購買狀態：`purchase`
- 操作：`bookingUrl`、`seatMap`

`seatMap.request` 是交給 provider client 的不透明請求資料；共用 UI 只檢查 `supported` 及 `layoutMode`，不應解讀 `scheduleKey`、`cinemaCode` 等來源欄位。

場次 metadata 會沿用 `showtime-metadata.js` 的正規化規則；當 MCL 只在 `versionName`／`displayVersion` 提供資料時，adapter 仍會保留可辨認的格式、語言及字幕，而無法辨認的明確來源值不會被覆蓋。

## 座位資料誠實度

`seats.quality`／`summary.quality` 只可使用：

| 值 | 意義 | 現時來源 |
|---|---|---|
| `exact` | 已讀取完整官方座位圖 | Broadway、MCL、Emperor、CineArt 座位圖 endpoint |
| `provider-summary` | 院線在場次層提供的座位數字 | Broadway、Emperor 場次 |
| `estimated` | 只有比例或近似資訊 | MCL `OccupiedSeatsInPercent` |
| `unknown` | 沒有可用座位資料 | 缺少摘要的場次 |

Adapter 不會由 MCL 百分比推算總座位或可選座位，也不會把 Emperor 的所有不可選座位猜成已售。

## SeatMapViewModel

外層結構固定為：

- `provider`、`sessionId`
- `layoutMode`
- `screenLabel`
- `summary`
- `sections`
- `notices`
- `purchaseLimit`
- `bookingUrl`
- `showtime`
- `source`

第三個參數可傳入原始場次或已正規化的 ShowtimeViewModel。Adapter 會把它轉成 `showtime`，讓共用全屏座位介面取得戲院、時間、影廳、制式、語言及官方購票連結；座位 renderer 不需要回頭讀取院線原始場次欄位。

定位模式：

| Provider | `layoutMode` | 保留的官方結構 |
|---|---|---|
| Broadway | `grid` | 行、座位編號、空格 |
| MCL | `area-grid` | 多分區、表格 cell、區域偏移、跨格座位 |
| Emperor | `positioned` | `left/top`、相對偏移、旋轉、分區與票價 |
| CineArt | `positioned` | 官方 parametric geometry、嚴格座位狀態、唯讀顯示 |

每個 section 都固定包含 `bounds`、`metrics`、`areas`、`rows`、`seats`；`seatmap-shared.js` 只按 `layoutMode` 選擇定位方式，共用全屏外殼、標題、摘要、圖例、載入、錯誤及官方購票操作。

Broadway 的所有行會使用整個影廳共同的最小／最大 column 範圍，避免不同行各自左移。MCL 若收到舊 parser 的 `rows` 而沒有 `areas`，adapter 會建立單一 `area-grid` section，保留原本 column 空格而不推測新座位。

`metrics` 固定保留 `totalColumns`、`cellColumns`、`ratioLeft`、`ratioTop`、`minRow`、`maxRow`、`minColumn`、`maxColumn`、`pitch`；不適用的欄位為 `null`，因此 MCL 的區域偏移及 Emperor 的格線範圍都不會在正規化時遺失。

## 統一座位語意

座位可用狀態與座位類型是兩個獨立維度：

| 維度 | 固定值 |
|---|---|
| `status` | `available`、`held`、`sold`、`blocked`、`unavailable`、`unknown` |
| `type` | `standard`、`wheelchair`、`sofa`、`couple`、`recliner`、`motion`、`special` |

主要映射：

- Broadway `H` 已由 Worker 轉為 `held`；未知座位種類保留為 `special`。
- MCL `wheelchair` → `available + wheelchair`；`sofa-sold` → `sold + sofa`；`broken` → `blocked + standard`。
- Emperor `disabled`／`isolation` → `blocked`，但原值保留在 `providerStatus`；`unavailable` 不會改稱 `sold`；`double-armchair` → `couple`，`extended-recliner` → `recliner`。

完整座位圖的六個統一狀態數量必須相加等於 `summary.total`。`providerStatus` 及 `providerType` 只供資料追蹤及動態說明，不應由共用 UI 直接當作固定字典。
