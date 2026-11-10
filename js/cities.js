/* cities.js — map position (latitude, longitude) of every city that has a store, for the store map.
 *
 * The data file lists each store's city but no coordinates, so these were added by hand.
 * They are approximate city centres (good enough for a bubble on a world/country map),
 * keyed by "Country|City" exactly as the names appear in data/data.js.
 * If a city is missing here, its bubble is skipped and a warning appears in the browser console.
 */
const CITY_COORDS = {
  // United States
  'United States|New York': [40.7128, -74.0060],
  'United States|Brooklyn': [40.6782, -73.9442],
  'United States|San Francisco': [37.7749, -122.4194],
  'United States|Cupertino': [37.3230, -122.0322],
  'United States|Chicago': [41.8781, -87.6298],
  'United States|Los Angeles': [34.0522, -118.2437],
  'United States|Glendale': [34.1425, -118.2551],      // Glendale, California
  'United States|Costa Mesa': [33.6411, -117.9187],
  'United States|Portland': [45.5152, -122.6784],      // Portland, Oregon
  'United States|Honolulu': [21.3069, -157.8583],
  'United States|Philadelphia': [39.9526, -75.1652],
  // Canada
  'Canada|Toronto': [43.6532, -79.3832],
  'Canada|Ottawa': [45.4215, -75.6972],
  'Canada|Montreal': [45.5019, -73.5674],
  'Canada|Burnaby': [49.2488, -122.9805],
  // Latin America
  'Mexico|Mexico City': [19.4326, -99.1332],
  'Colombia|Bogota': [4.7110, -74.0721],
  // Europe
  'United Kingdom|London': [51.5074, -0.1278],
  'France|Paris': [48.8566, 2.3522],
  'Austria|Vienna': [48.2082, 16.3738],
  'Spain|Barcelona': [41.3874, 2.1686],
  'Italy|Milan': [45.4642, 9.1900],
  'Italy|Rome': [41.9028, 12.4964],
  'Germany|Berlin': [52.5200, 13.4050],
  'Germany|Cologne': [50.9375, 6.9603],
  'Germany|Munich': [48.1351, 11.5820],
  'Netherlands|Amsterdam': [52.3676, 4.9041],
  // Middle East
  'UAE|Dubai': [25.2048, 55.2708],
  'UAE|Abu Dhabi': [24.4539, 54.3773],
  // Asia
  'Japan|Tokyo': [35.6762, 139.6503],
  'Japan|Kyoto': [35.0116, 135.7681],
  'Japan|Fukuoka': [33.5904, 130.4017],
  'Japan|Kumamoto': [32.8031, 130.7079],
  'China|Shanghai': [31.2304, 121.4737],
  'China|Beijing': [39.9042, 116.4074],
  'China|Chengdu': [30.5728, 104.0668],
  'China|Hong Kong': [22.3193, 114.1694],
  'China|Macau': [22.1987, 113.5439],
  'Taiwan|Taipei': [25.0330, 121.5654],
  'South Korea|Seoul': [37.5665, 126.9780],
  'Thailand|Bangkok': [13.7563, 100.5018],
  'Singapore|Singapore': [1.3521, 103.8198],
  // Australia
  'Australia|Sydney': [-33.8688, 151.2093],
  'Australia|Bondi': [-33.8915, 151.2767],
  'Australia|Melbourne': [-37.8136, 144.9631],
  'Australia|Cheltenham': [-37.9670, 145.0540],        // Cheltenham, Victoria (Apple Southland)
  'Australia|Brisbane': [-27.4698, 153.0251],
};
