# HK Cinema 共用展示契約

Version: 1（Phase 7B）

`app/view-models.js` 是來源正規化與共用 UI 之間的唯一展示契約。Broadway、MCL、Emperor 的原始欄位先經 provider adapter 轉換；共用 renderer 不應直接讀取院線原始 JSON。

目前 Phase 7B 第一個 checkpoint 只建立及載入資料層，既有詳情與座位 renderer 尚未切換，因此正式畫面保持不變。

## 公開 API

```js
window.HKCinemaViewModels.movie(providerId, movie, detail?)
window.HKCinemaViewModels.showtime(providerId, session)
window.HKCinemaViewModels.seatMap(providerId, seatMap, showtime?)
```

三個 provider ID 固定為 `broadway`、`mcl`、`emperor`。輸出分別以 `kind` 標示 `movie-detail`、`showtime`、`seat-map`，並帶有 `schemaVersion: 1`。

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
| `exact` | 已讀取完整官方座位圖 | 三院線座位圖 endpoint |
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

每個 section 都固定包含 `bounds`、`metrics`、`areas`、`rows`、`seats`；renderer 只按 `layoutMode` 選擇定位方式，共用標題、摘要、圖例、載入、錯誤及官方購票操作。

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
