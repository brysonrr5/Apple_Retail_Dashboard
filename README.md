# Apple Retail Performance Dashboard (BUSOBA 3331, Project 1)

Interactive web dashboard built with HTML, CSS and plain JavaScript. It needs no server. The only outside library is Leaflet 1.9.4 (open-source map library), which is included in `lib/leaflet/`. Everything works offline except the store map's background image, which loads from Esri over the internet. Without internet, the map bubbles still show, but on a blank grey area.

## How to open it
1. Unzip the folder.
2. Double-click `index.html`. It opens in any modern browser (Chrome, Edge, Safari or Firefox).

To host it online, upload the whole folder to GitHub Pages or Netlify (drag and drop).

## Folder contents
| File | What it does |
|---|---|
| `index.html` | Page structure: filters, KPI tiles, chart cards, insights, data notes |
| `css/styles.css` | Layout, colors, typography (design tokens at the top) |
| `js/charts.js` | Draws the bar, line and column charts as SVG, with hover and keyboard tooltips |
| `js/app.js` | Filters, KPI formulas, chart updates, the store map and table views |
| `js/cities.js` | Map positions (latitude, longitude) of the 47 store cities |
| `lib/leaflet/` | Leaflet 1.9.4 map library (unchanged copy of the official download) |
| `data/data.js` | Cleaned, pre-aggregated data (generated; do not edit by hand) |
| `prep/prepare_data.py` | Rebuilds `data/data.js` from the Excel workbook |
| `PROJECT_NOTES.md` | Cleaning steps, KPI definitions, validation table, AI-log material |

## Rebuilding the data
```
python3 prep/prepare_data.py path/to/Apple_Sales_Data_3331_Version2.xlsx
```
This requires Python 3 with `pandas` and `openpyxl` and takes about a minute. The 1,040,200 sales rows are summed into about 52,000 rows, so the browser loads them instantly.

## Using the dashboard
- The dashboard is a landscape, one-screen layout, best viewed full-screen at 1440×900 or larger (e.g. a projector at 1920×1080). Smaller windows switch to a scrolling layout.
- **Sidebar:** switch between the **Dashboard** and **Insights & notes** pages. Insights & notes holds the insights, KPI formulas and data limitations.
- **Filters** (Year, Country, Product category) update every KPI and chart together. **Reset filters** clears them.
- **Top 10 / Bottom 10** toggles switch the product and store rankings.
- **Revenue by city map:** one bubble per city, sized by revenue. Hover over a bubble for its stores, revenue and warranty claim rate. Drag or use +/− to move around. Choosing a country zooms to it.
- **Table** on any chart shows the exact numbers behind it.
- Hover over or tab to any bar or point to see its exact value.
