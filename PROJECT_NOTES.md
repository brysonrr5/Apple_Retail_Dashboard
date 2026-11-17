# Project notes: Apple Retail Performance Dashboard

Material for the project brief, the validation evidence and the AI development log. All numbers below come from the cleaned data (Jan 2020 – Oct 2024) unless noted.

## 1. Audience and decisions
**Audience:** Apple retail operations manager responsible for store network and product mix.

**Questions the dashboard answers:**
1. Is revenue growing over time? (trend chart, revenue KPI with year-over-year change)
2. Which products and categories drive revenue, and which lag? (product revenue concentration chart with a ranked table, category chart)
3. Which stores and countries perform best, once store count is accounted for? (store ranking, revenue-by-city map, revenue per store per month KPI)
4. Are there seasonal peaks to plan staffing and inventory around? (trend chart with a single year selected; insight 2 on revenue per day)
5. Are warranty claims being handled? (claim rate KPI, repair status chart)

## 2. Dataset
Apple Retail Sales dataset (Kaggle). The workbook has 5 linked sheets:
- **Category:** 10 rows
- **Products:** 89 rows
- **Stores:** 75 rows
- **Sales:** 1,040,200 rows
- **Warranty:** 30,000 rows

The links run sales → product → category, sales → store and warranty → sale.

## 3. Cleaning steps
| Step | Rows affected | Decision and reason |
|---|---|---|
| Checked for blanks, duplicate rows and broken links | 0 | None found. Every product, store, category and warranty sale ID has a match. |
| Excluded Nov 2024 sales | 6,982 sales | The data stops on 12 Nov 2024, so November is incomplete. Keeping it would make Nov 2024 look like a 60% drop. |
| Excluded warranty claims on those sales | 203 claims | Their sales were excluded. |
| Derived **revenue** | All rows | quantity × product list price |
| Derived year and month | All rows | Taken from sale_date (stored day-month-year in the source file) |
| Duplicate store names | 6 names, 12 store IDs | Apple Central World, Chadstone, Champs-Elysees, Covent Garden, Orchard Road and The Dubai Mall each have 2 IDs. They are kept as separate stores and labeled with their ID, e.g. "Apple Chadstone (ST-52)". |
| Duplicate product name | 1 name, 2 IDs | HomePod mini appears as P-21 (Audio, $438) and P-75 (Smart Speaker, $266). They are kept separate and labeled with their category. |
| Sales before product launch date | 493,123 sales (48%) | Kept. Removing half the data would distort every metric. Listed as a limitation. |
| Warranty claims dated before their sale | 2,488 claims | Kept and listed as a limitation. |
| Aggregation | 1,033,218 sales → 43,474 + 8,455 rows | Summed to month × store × category and year × country × product so the browser can filter instantly. Totals are unchanged. |

## 4. KPI definitions
| KPI | Formula | Units | Comparison shown |
|---|---|---|---|
| Total revenue | Σ (quantity × list price) | USD | % change vs. the same months of the prior year |
| Units sold | Σ quantity | units | % change vs. the same months of the prior year |
| Average revenue per sale | revenue ÷ number of sales transactions | USD | % change vs. the same months of the prior year |
| Revenue per store per month | revenue ÷ (stores in view × months in view) | USD | % change vs. the same months of the prior year; makes countries with different store counts comparable |
| Warranty claim rate | claims on sales in view ÷ sales in view | % | Change in percentage points vs. the prior year. A higher rate is shown in red. |

Trend chart measures (not KPI tiles): **revenue per day** = the month's revenue ÷ days in that month (February has 29 days in 2020 and 2024); **3-month rolling average** = revenue of the month and the two before it ÷ days in those three months.

"Same months of the prior year" matters for 2024, which only has Jan–Oct: 2024 is compared with Jan–Oct 2023, not all of 2023.

## 5. Chart and design rationale
- **Monthly revenue trend (line, revenue per day):** A line suits change over time. Each point is the month's revenue ÷ the days in that month, so 28-day Februaries no longer look like slumps (monthly totals swung about ±7% around the average; per day the swing is within ±2%). A thicker, darker line shows the 3-month rolling average: revenue of the month and the two before it ÷ the days in those three months, so it starts in March 2020. A legend names both lines. The y-axis is zoomed to the data (with round-number gridlines), and the subtitle says "USD per day, by month · axis does not start at $0" so readers don't over-read small swings. When a single year is selected, the chart shows that year's per-day line and 3-month average, plus the prior year's per-day line in gray. The tooltip and Table view show per day, the month's total revenue (with its number of days) and the 3-month average. All bar and column charts still start at $0.
- **Revenue by category (ranked bars):** Bars compare 10 categories accurately; a donut would not. The selected category is highlighted in blue and the others turn gray, which keeps the context visible.
- **Product revenue concentration (cumulative-share curve):** Replaced the Top/Bottom 10 product bars (and, later, a price-vs-units bubble chart; see section 7) to answer "is revenue concentrated in a few products?" Products are ranked from highest to lowest revenue. The x-axis is the share of products (0–100%) and the y-axis is the cumulative share of revenue (0–100%). A thin gray diagonal, labeled "Equal revenue per product", is the comparison: the further the blue curve bows above it, the more concentrated revenue is. With no filters the curve stays close to the diagonal (top 10 = 19.4%, top 20% = 33.4%), which supports insight 4.
  - **Marked points:** "Top 10 products" (shown only when more than 10 products are in view, otherwise it is always 100%) and "Top 20% of products", where 20% is rounded to the nearest whole product with a minimum of 1 (89 → 18). In small categories where rounding moves far from 20% (more than 5 points), the label states the actual count and share instead, e.g. Smart Speaker: "Top 1 product (50%) = 82.1% of revenue". Labels sit in the empty lower-right area with thin pointer lines.
  - **Filters:** year and country recalculate the ranking; a single category shows concentration within that category.
  - **Hover and keyboard:** the tooltip snaps to the nearest product and shows its name, rank, revenue and cumulative share up to that product. Keyboard users tab to the chart once and step through products with the arrow keys.
  - **Table:** the full ranked list (rank, product, category, price, revenue, units, cumulative share), so the top and bottom products are still available without the old Top/Bottom toggle.
- **Store ranking (horizontal bars, Top/Bottom 10):** Horizontal bars fit long names, and the Top/Bottom toggle answers both "best" and "worst". Both views use the same scale so bars are comparable.
- **Revenue by city (Leaflet map, bubbles):** Replaced the earlier "Revenue by month" column chart to show *where* revenue comes from.
  - **Bubbles:** one per city (47 cities, 75 stores). Stores are grouped by Store_ID into their city, so duplicate store names never merge.
  - **Bubble area** ∝ city revenue (radius ∝ √revenue), scaled to the largest city in view.
  - **Hover box:** city, number of stores, revenue, and claim rate. Claim rate = the city's claims ÷ its sales in view, the same formula as the KPI. For years before 2024 the hover box says "no claims recorded (claims are 2024 only)" instead of 0%.
  - **Filters:** follows Year, Country and Category. Choosing a country zooms to its cities.
  - **City positions:** the data has no coordinates, so approximate city-centre positions are listed in `js/cities.js`.
  - **Background:** Esri "World Light Gray Canvas" tiles, which need no API key. The required credit line, "Powered by Esri | Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community", shows in the map corner.
  - Because every store earns about the same, bubble size mostly reflects how many stores a city has (see insight 3).
- **Warranty claims by status (donut):** One slice per status in the order Completed, In Progress, Pending, Rejected. The center shows the % still open (In Progress + Pending ÷ all claims), and the legend beside the ring gives each status's count and percent. Hovering a slice or legend row shows the exact numbers.
- **Color:** One blue for data and gray for de-emphasis. Green and red appear on KPI changes, always with ▲/▼ arrows so the meaning never depends on color alone. The warranty donut uses status colors (dark green Completed, amber In Progress, gray Pending, red Rejected). Each has a clearly different lightness, checked with a colorblindness simulator, and every slice is named in the legend.
- **Layout:** The dashboard is a landscape, single-screen layout like a standard BI dashboard, and fits 1920×1080 and 1440×900 without scrolling. Filters sit in a navy sidebar on the left. Five KPI tiles run across the top, then six charts in a 2-row grid, read left to right: trend → category mix → service, then products → stores → location (map). Insights, KPI formulas and data notes are on a second page ("Insights & notes" in the sidebar), so the dashboard page stays uncluttered. Every chart has a Table view. The SVG charts also have keyboard-accessible tooltips. The map's hover boxes are mouse-only, and its Table view gives the same figures for keyboard users.

## 6. Validation evidence (18 values checked independently)
The expected values were recalculated in Python (pandas) directly from the raw workbook sheets. They do not use the dashboard's aggregated file. The shown values were read from the dashboard running in Chrome with the listed filters applied.

| # | Value checked | Filters | Expected (pandas) | Shown on dashboard | Result |
|---|---|---|---|---|---|
| 1 | Total revenue (KPI) | No filters | $6.12B | $6.12B | ✅ Match |
| 2 | Units sold (KPI) | No filters | 5,682,520 | 5,682,520 | ✅ Match |
| 3 | Average revenue per sale (KPI) | 2023, Japan | $5,948 | $5,948 | ✅ Match |
| 4 | Revenue per store per month (KPI) | 2024, United States | $1.41M | $1.41M | ✅ Match |
| 5 | Warranty claim rate (KPI) | Laptop | 2.90% | 2.90% | ✅ Match |
| 6 | Revenue change 2024 vs Jan-Oct 2023 (KPI delta) | 2024 | ▲ 0.9% vs Jan–Oct 2023 | ▲ 0.9% vs Jan–Oct 2023 | ✅ Match |
| 7 | #1 product revenue, 2022 Germany (Products table) | 2022, Germany | AirPods (3rd Generation) | $1,027,836 | AirPods (3rd Generation) | $1,027,836 | ✅ Match |
| 8 | #1 store revenue, Smartphone (Stores table) | Smartphone | Apple Downtown Brooklyn | $12,117,289 | Apple Downtown Brooklyn | $12,117,289 | ✅ Match |
| 9 | March 2022 revenue, Canada Audio (Trend table) | 2022, Canada, Audio | $895,713 | $895,713 | ✅ Match |
| 10 | Dubai revenue and claim rate (Map table) | No filters | $326,881,479 · 2.96% | $326,881,479 · 2.96% | ✅ Match |
| 11 | Pending claims, 2021 UAE Tablet (Warranty table) | 2021, UAE, Tablet | 12 | 12 | ✅ Match |
| 12 | Tablet share of revenue, 2020 (Category table) | 2020 | 15.4% | 15.4% | ✅ Match |
| 13 | Feb 2024 revenue per day and 3-month avg (Trend table, leap year) | 2024 | $3,479,324 · $3,477,943 | $3,479,324 · $3,477,943 | ✅ Match |
| 14 | Mar 2022 revenue per day and 3-month avg, Canada Audio (Trend table) | 2022, Canada, Audio | $28,894 · $29,864 | $28,894 · $29,864 | ✅ Match |
| 15 | Warranty donut: four status counts add up to total claims | No filters | 7,419 + 7,558 + 7,515 + 7,305 = 29,797; 51% open | same | ✅ Match |
| 16 | Top and bottom product units, revenue and price (Products table) | No filters | #1 Apple Music 63,514 units · $124,805,010 · $1,965; #89 MacBook (Retina) 64,093 · $14,805,483 · $231 | same | ✅ Match |
| 17 | Top and bottom product units and revenue (Products table) | 2022, Germany | #1 AirPods (3rd Generation) 558 · $1,027,836; #89 MacBook (Retina) 458 · $105,798 | same | ✅ Match |
| 18 | Product revenue concentration: Top 10 and Top 20% share (chart labels, tooltip, table) | No filters; 2022, Germany; Laptop | 19.4% · 33.4% (18 of 89); 19.5% · 33.3%; Top 20% (2 of 10) = 30.3% | same | ✅ Match |

How each expected value was calculated:
1. Total revenue (KPI): sum(quantity*price) = $6,124,473,096
2. Units sold (KPI): sum(quantity)
3. Average revenue per sale (KPI): $102,636,197 / 17,255 sales
4. Revenue per store per month (KPI): $212,214,158 / (15 stores x 10 months) = $1,414,761
5. Warranty claim rate (KPI): 3,349 claims / 115,613 sales
6. Revenue change 2024 vs Jan-Oct 2023 (KPI delta): ($1,059,637,725 - $1,050,470,663) / $1,050,470,663
7. #1 product revenue, 2022 Germany (Products table): group by product, sum revenue, sort
8. #1 store revenue, Smartphone (Stores table): group by store ID, sum revenue, sort
9. March 2022 revenue, Canada Audio (Trend table): sum revenue for Mar 2022
10. Dubai revenue and claim rate (Map table): stores joined to sales by store_id, sales before 1 Nov 2024; revenue = Σ quantity × price = $326,881,479; claims 1,632 ÷ sales 55,204 = 2.96%. This check replaced the earlier February revenue-per-day check ($3,459,288, which also matched) when the months chart was removed. It was calculated with a short standard-library Python script that reads the .xlsx directly, because pandas was not installed on that machine. The same script also matched London ($326,648,973 · 2.91%), New York ($247,501,157 · 2.99%), Melbourne ($246,126,767 · 2.91%) and the total of all 47 cities ($6,124,473,096).
11. Pending claims, 2021 UAE Tablet (Warranty table): count claims with status Pending
12. Tablet share of revenue, 2020 (Category table): Tablet revenue / total revenue
13–15 were calculated with a standard-library Python script that reads the .xlsx directly (pandas not installed), applying the same 1 Nov 2024 cut-off.
13. Feb 2024 per day: $100,900,403 ÷ 29 days; 3-month avg = (Dec 2023 + Jan 2024 + Feb 2024 revenue) ÷ (31 + 31 + 29). The same script matched Jan/Feb/Mar 2020, Feb 2021–2023, Oct 2024 and Nov 2022 Canada Audio, and the 2020–2024 February per-day figure ($3,459,288 = total February revenue ÷ February days).
14. Mar 2022 Canada Audio per day: $895,713 ÷ 31; 3-month avg = (Jan + Feb + Mar 2022) ÷ (31 + 28 + 31).
15. Warranty donut: count claims by repair status, on sales before 1 Nov 2024. The slices also summed to the total in 5 other combinations (2024 US: 1,054; UAE Tablet: 243; 2021 UAE Tablet: 60; Laptop: 3,349; 2023: 6,109).
16–17. Products (standard-library script reading the .xlsx, sales before 1 Nov 2024): units = Σ quantity per Product_ID, revenue = Σ quantity × Products price, ranked by revenue. The top 3 and bottom 3 products matched in both views (no filters: Apple Music, iMac 27-inch, iPad (9th Generation) / HomePod mini (Smart Speaker), Apple News+, MacBook (Retina); 2022 Germany: AirPods (3rd Generation), MacBook Air (M2), Apple Music / Apple News+, HomePod mini (Smart Speaker), MacBook (Retina)). For every product, revenue ÷ units equals its Products-sheet price exactly. Units per product range 62,282–65,244 with no filters.
18. Concentration: `prep/validation/check_concentration.py` (saved in the project; reads the .xlsx directly with the standard library, sales before 1 Nov 2024). Products ranked by revenue; cumulative share = running revenue ÷ total. No filters: top 10 = $1,186.9M of $6,124.5M = 19.4%; top 18 (20% of 89, rounded) = 33.4%. 2022 Germany: 19.5% and 33.3%. Laptop (10 products, so no Top 10 marker): top 2 = 30.3%. The chart's labels, tooltip ("#10 of 89 … 19.4% of revenue (top 10 combined)") and table's Cumulative share column showed the same values in Chrome.

**Filter combination test:** all 1,320 combinations of Year (6) × Country (20) × Category (11) were applied in the browser. The revenue KPI matched pandas in every case, and no NaN, undefined or blank values appeared.

## 7. Problems detected and corrected (for the AI development log)
1. **Wrong end date in the outline.** The outline said the data ends 12/11/2024 (11 Dec). The source stores dates as day-month-year, so the data actually ends **12 Nov 2024**. **Fix:** excluded incomplete Nov 2024 and compared 2024 only with Jan–Oct 2023.
2. **Duplicate store names would have doubled store revenue.** Grouping by store *name* made "Apple Chadstone" look like the top store at about $165M. It is really two stores (ST-52 and ST-67) at about $83M each. **Fix:** grouped by Store_ID and labeled the duplicates with their ID.
3. **Hypothesis not supported by the data.** The outline expected revenue growth and a Q4 peak. Annual Jan–Oct revenue varies by less than 1% across 2020–2024, and no quarter stands out. **Fix:** the insights report a flat trend.
4. **Insight number didn't match the chart.** The first draft of insight 2 quoted February at $97.6M, an average of 2020–2023 only. The dashboard averages 2020–2024 and shows $98.2M. **Fix:** updated the text to match what the chart displays.
5. **Chart library unavailable offline.** Chart.js could not be loaded in the build environment. **Fix:** the charts are drawn with plain JavaScript and SVG (`js/charts.js`), so the dashboard also works without internet during the presentation. The one exception is the map background, which needs internet (see Limitations).
6. **Map background showed "API KEY REQUIRED".** The first choice of plain background map (CARTO) now needs a sign-up key. **Fix:** switched to Esri's World Light Gray Canvas, which needs no key, and updated the credit line to Esri's required wording.
7. **Map bubbles were invisible.** An existing style rule meant for the SVG charts (`.chart svg`, which stretches the drawing to fill the card) also caught Leaflet's bubble layer and pushed it out of place. **Fix:** narrowed the rule to `.chart > svg` so it only touches the dashboard's own charts.
8. **Flat-looking trend line.** With the axis from $0, monthly revenue ($96M–$110M) looked like a flat line near the top of the chart. **Fix:** zoomed the trend axis to the data range and added "axis does not start at $0" to its subtitle (see section 5).
9. **Product bubble chart was unreadable.** A "Product price vs units sold" bubble chart was tried in place of the Top/Bottom 10 product bars. Because every product sells about 62,000–65,000 units, all 89 bubbles landed in one thin band and overlapped so heavily that individual products could not be picked out. It also needed its colors reduced to three product families, because 10 category colors cannot be told apart by colorblind viewers when bubbles overlap. **Fix:** replaced it with the product revenue concentration chart, which shows the same story (revenue is spread across products, and price explains the gap) as one readable line. The "price, not volume" point moved into insight 4.

## 8. Limitations
- Revenue uses list price; actual selling prices and discounts are not in the data.
- Nov 1–12, 2024 is excluded and December 2024 is missing, so 2024 covers Jan–Oct only.
- 48% of sales predate the product's listed launch date, so launch dates are unreliable.
- All warranty claims are dated in 2024, and 2,488 predate their sale. The claim rate is the share of sales with a claim filed in 2024.
- Map positions are approximate city centres, typed in by hand. The map background needs an internet connection: offline, the bubbles still appear but on a blank grey area.
- Sales are spread almost perfectly evenly across stores (13,551–14,113 sales each) and months, which suggests synthetic data. The insights describe this dataset, not real Apple performance.
