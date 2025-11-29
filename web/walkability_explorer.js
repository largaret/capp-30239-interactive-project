const map = new maplibregl.Map({
  container: "map",
  style: "https://api.maptiler.com/maps/019acc55-20fb-789b-818a-8874d992c0e3/style.json?key=WRaHA83n4MbC5JM8vMFl",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

// -----------------------------
// City markers (unchanged)
// -----------------------------
const cities = [
  { name: "New York", id: "ny", coords: [-74.0060, 40.7128] },
  { name: "Los Angeles", id: "la", coords: [-118.2437, 34.0522] },
  { name: "Chicago", id: "chi", coords: [-87.6298, 41.8781] }
];

const cityMarkers = {};
const bboxCache = {};

// -----------------------------
// Add markers
// -----------------------------
cities.forEach(city => {
  const popupHTML = `
    <strong>${city.name}</strong><br>
    <a href="#" id="zoom-${city.id}">Explore ${city.name}</a>
  `;

  const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupHTML);

  popup.on("open", () => {
    const link = document.getElementById(`zoom-${city.id}`);
    if (link) {
      link.onclick = (event) => {
        event.preventDefault();
        map.flyTo({ center: city.coords, zoom: 10, speed: 0.6 });
        cityMarkers[city.id].remove();
      };
    }
  });

  const marker = new maplibregl.Marker()
    .setLngLat(city.coords)
    .setPopup(popup)
    .addTo(map);

  cityMarkers[city.id] = marker;
});

// -----------------------------
// Reset button
// -----------------------------
document.getElementById("resetViewBtn").addEventListener("click", () => {
  map.flyTo({ center: [-98, 39], zoom: 3, speed: 0.6 });
  Object.values(cityMarkers).forEach(marker => {
    if (!marker._map) marker.addTo(map);
  });
  hideWalkabilityLayer();
});

// -----------------------------
// OPTION A — Dynamic bounding box size based on zoom
// -----------------------------
function dynamicBBoxSize(zoom) {
  if (zoom < 10) return 0.0;
  if (zoom < 11) return 0.45;
  if (zoom < 12) return 0.32;
  if (zoom < 13) return 0.20;
  if (zoom < 14) return 0.12;
  return 0.075;
}

function getBoundingBox(center, zoom) {
  const size = dynamicBBoxSize(zoom);
  return {
    getWest:  () => center.lng - size,
    getSouth: () => center.lat - size,
    getEast:  () => center.lng + size,
    getNorth: () => center.lat + size
  };
}

function bboxKey(bounds) {
  return [
    bounds.getWest().toFixed(4),
    bounds.getSouth().toFixed(4),
    bounds.getEast().toFixed(4),
    bounds.getNorth().toFixed(4)
  ].join(",");
}

// -----------------------------
// Query URL
// -----------------------------
function buildWalkabilityQueryURL(bounds) {
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  const url = new URL('https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0/query');
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('geometry', bbox.join(','));
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('outSR', '4326');
  
  // try: allow no. of features to exceed limit
  url.searchParams.set("returnExceededLimitFeatures", "true");
  
  return url.toString();
}


// -----------------------------
// Fetch + cache
// -----------------------------
async function fetchWalkability(bounds) {
  const key = bboxKey(bounds);
  if (bboxCache[key]) return bboxCache[key];

  try {
    const url = buildWalkabilityQueryURL(bounds);
    const resp = await fetch(url);
    const data = await resp.json();
    bboxCache[key] = data;
    return data;
  } catch (err) {
    console.error("Walkability fetch error:", err);
  }
}

// -----------------------------
// Walkability layer rendering
// -----------------------------
document.getElementById("colorVar").addEventListener("change", () => {
  if (map.getLayer("walkability-layer")) {
    const selectedVar = document.getElementById("colorVar").value;
    map.setPaintProperty("walkability-layer", "fill-color", getFillColorExpression(selectedVar));
  }
});

function getFillColorExpression(selectedVar) {
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", selectedVar], 0],

    // You can refine these scale values later:
    0,   "#ffffcc",
    5.75,  "#a1dab4",
    10.5,  "#41b6c4",
    15.25,  "#2c7fb8",
    20, "#253494"
  ];
}

function showWalkabilityLayer(data) {
  const selectedVar = document.getElementById("colorVar").value;

  if (map.getSource('walkability')) {
    map.getSource('walkability').setData(data);

    map.setPaintProperty('walkability-layer', 'fill-color',
      getFillColorExpression(selectedVar)
    );

    map.setLayoutProperty('walkability-layer', 'visibility', 'visible');
    map.setLayoutProperty('walkability-outline', 'visibility', 'visible');
  } else {
    map.addSource('walkability', { type: 'geojson', data });

    map.addLayer({
      id: 'walkability-layer',
      type: 'fill',
      source: 'walkability',
      paint: {
        'fill-color': getFillColorExpression(selectedVar),
        'fill-opacity': 0.6
      }
    });

    map.addLayer({
      id: 'walkability-outline',
      type: 'line',
      source: 'walkability',
      paint: { 'line-color': '#000', 'line-width': 0.5 }
    });
  }
}


function hideWalkabilityLayer() {
  if (map.getLayer("walkability-layer"))
    map.setLayoutProperty("walkability-layer", "visibility", "none");

  if (map.getLayer("walkability-outline"))
    map.setLayoutProperty("walkability-outline", "visibility", "none");
}

// -----------------------------
// Load polygons based on map center
// -----------------------------
async function updateWalkability() {
  if (map.getZoom() < 10) {
    hideWalkabilityLayer();
    return;
  }

  const center = map.getCenter();
  const zoom = map.getZoom();
  const bounds = getBoundingBox(center, zoom);

  const data = await fetchWalkability(bounds);
  if (data) showWalkabilityLayer(data);
}

// Events
map.on("zoomend", updateWalkability);
map.on("moveend", updateWalkability);

// Popup on polygons
map.on("click", "walkability-layer", (e) => {
  const props = e.features[0].properties;
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`
      <strong>Walkability Index:</strong> ${props.NatWalkInd}<br/>
      <strong>Block Group:</strong> ${props.GEOID10}
    `)
    .addTo(map);
});
