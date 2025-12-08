// -----------------------------------------------------------------------------
// INITIAL MAP
// -----------------------------------------------------------------------------
let navControl = new maplibregl.NavigationControl();   

const map = new maplibregl.Map({
  container: "map",
  style: "https://api.maptiler.com/maps/019acc55-20fb-789b-818a-8874d992c0e3/style.json?key=WRaHA83n4MbC5JM8vMFl",
  center: [-98, 39],
  zoom: 3.5,
  minZoom: 3,
});
map.dragPan.disable();

// -----------------------------------------------------------------------------
// CITY MARKERS
// -----------------------------------------------------------------------------
const cities = [
  { name: "New York", id: "ny", coords: [-74.0060, 40.7128] },
  { name: "Los Angeles", id: "la", coords: [-118.2437, 34.0522] },
  { name: "Chicago", id: "chi", coords: [-87.6298, 41.8781] },
  { name: "Dallas", id: "dal", coords: [-96.7970, 32.7767] },
  { name: "Houston", id: "hou", coords: [-95.3698, 29.7604] }
];

const cityMarkers = {};
let currentWalkabilityData = null;
let zoomLocked = false;
let isResetting = false;


// -----------------------------------------------------------------------------
// FLY THEN CALLBACK
// -----------------------------------------------------------------------------
function flyAndThen(map, options, callback) {
  function handler() {
    map.off("moveend", handler);
    callback();
  }
  map.on("moveend", handler);
  map.flyTo(options);
}


// -----------------------------------------------------------------------------
// ADD CITY MARKERS
// -----------------------------------------------------------------------------
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

        flyAndThen(map, { center: city.coords, zoom: 10, speed: 0.6 }, () => {
          zoomLocked = true;
          map.setMinZoom(10);

          map.dragPan.enable();
          map.scrollZoom.enable();

          const marker = cityMarkers[city.id];
          marker.remove();
          marker.isVisible = false;

          if (!map.hasControl(navControl)) {
            map.addControl(navControl, "top-right");
          }
        });
      };
    }
  });

  const marker = new maplibregl.Marker()
    .setLngLat(city.coords)
    .setPopup(popup)
    .addTo(map);

  marker.isVisible = true;
  cityMarkers[city.id] = marker;
});


// -----------------------------------------------------------------------------
// RESET VIEW BUTTON — FULLY SMOOTH, NO JUMP
// -----------------------------------------------------------------------------
document.getElementById("resetViewBtn").addEventListener("click", () => {
  isResetting = true;

  // Remove nav control immediately
  try { map.removeControl(navControl); } catch(e){}

  // Temporarily enable dragPan so flyTo is not clamped
  map.dragPan.enable();
  map.scrollZoom.enable();

  
  // Hide walkability layers
  hideWalkabilityLayer();

  // Set minZoom low so we can zoom out
  map.setMinZoom(3);

  // Fly to national view smoothly
  flyAndThen(map, {
    center: [-98, 39],
    zoom: 3.5,
    speed: 0.9,
    essential: true
  }, () => {
    // After fly completes, restore proper state

    isResetting = false;
    zoomLocked = false;

    // Disable drag/scroll at national view
    map.dragPan.disable();
    map.scrollZoom.disable();

    // Restore all city markers
    Object.values(cityMarkers).forEach(marker => {
      if (!marker.isVisible) {
        marker.addTo(map);
        marker.isVisible = true;
      }
    });

    // Reset outline styling
    if (map.getLayer("walkability-outline")) {
      map.setFilter("walkability-outline", null);
      map.setPaintProperty("walkability-outline", "line-color", "#fff");
      map.setPaintProperty("walkability-outline", "line-width", 0);
    }

    if (map.getLayer("remote-walkability-outline")) {
      map.setFilter("remote-walkability-outline", null);
      map.setPaintProperty("remote-walkability-outline", "line-color", "#fff");
      map.setPaintProperty("remote-walkability-outline", "line-width", 0);
    }

    // Remove address marker if present
    if (addressMarker) {
      addressMarker.remove();
      addressMarker = null;
    }
  });
});


// -----------------------------------------------------------------------------
// NEW SEARCH
// -----------------------------------------------------------------------------
// go back to national view when a new search is made
document.getElementById("newSearchBtn").addEventListener("click", () => {
  document.getElementById("resetViewBtn").click();
});

// -----------------------------------------------------------------------------
// AUTO COLOR SCALE
// -----------------------------------------------------------------------------
function getFillColorExpression(selectedVar) {

  const min = 1;
  const max = 20;

  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", selectedVar], min],
    min, "#ffffcc",
    min + (max - min) * 0.25, "#a1dab4",
    min + (max - min) * 0.50, "#41b6c4",
    min + (max - min) * 0.75, "#2c7fb8",
    max, "#253494"
  ];
}


// -----------------------------------------------------------------------------
// DROPDOWN
// -----------------------------------------------------------------------------
document.getElementById("colorVar").addEventListener("change", () => {
  if (map.getLayer("walkability-layer")) {
    const selectedVar = document.getElementById("colorVar").value;
    map.setPaintProperty("walkability-layer", "fill-color",
      getFillColorExpression(selectedVar)
    );
    map.setPaintProperty("remote-walkability-layer", "fill-color",
      getFillColorExpression(selectedVar)
    );
  }
});


// -----------------------------------------------------------------------------
// LOAD GEOJSON
// -----------------------------------------------------------------------------
map.on("load", async () => {
  const geojson = await fetch("data/walkability.geojson").then(r => r.json());
  currentWalkabilityData = geojson;

  map.addSource("walkability", {
    type: "geojson",
    data: geojson
  });

  const selectedVar = document.getElementById("colorVar").value;

  map.addLayer({
    id: "walkability-layer",
    type: "fill",
    source: "walkability",
    paint: {
      "fill-color": getFillColorExpression(selectedVar),
      "fill-opacity": 0.7
    },
    layout: { "visibility": "none" }
  });

  map.addLayer({
    id: "walkability-outline",
    type: "line",
    source: "walkability",
    paint: { "line-color": "#fff", "line-width": 0 },
    layout: { "visibility": "none" }
  });

  // -----------------------------------------------------------------------------
  // REMOTE WALKABILITY LAYER (for on-demand features)
  // -----------------------------------------------------------------------------
  map.addSource("remote-walkability", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  map.addLayer({
    id: "remote-walkability-layer",
    type: "fill",
    source: "remote-walkability",
    paint: {
      "fill-color": getFillColorExpression(selectedVar),
      "fill-opacity": 0.7
    }
  });

  map.addLayer({
    id: "remote-walkability-outline",
    type: "line",
    source: "remote-walkability",
    paint: { "line-color": "#fff", "line-width": 0 }
  });

});

// -----------------------------------------------------------------------------
// FETCH REMOTE FEATURE FROM ARCGIS
// -----------------------------------------------------------------------------
// Cache for remote features
let fetchedFeaturesCache = {};
// Remote features cache
let remoteFeatures = [];

// Build ArcGIS query URL for a bounding box
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
  url.searchParams.set('returnExceededLimitFeatures', 'true');
  
  return url.toString();
}

// Fetch remote polygons in a bounding box
async function fetchWalkabilityInBounds(bounds) {
  const url = buildWalkabilityQueryURL(bounds);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) return;

    // Filter out features we already have
    const newFeatures = data.features.filter(f => !fetchedFeaturesCache[f.properties.GEOID20]);
    newFeatures.forEach(f => {
      const geoid = f.properties.GEOID20;
      fetchedFeaturesCache[geoid] = f;
      remoteFeatures.push(f);
    });

    // Update remote-walkability source
    const remoteSource = map.getSource("remote-walkability");
    if (remoteSource) {
      remoteSource.setData({
        type: "FeatureCollection",
        features: remoteFeatures
      });
    }

  } catch (err) {
    console.error("Failed to fetch remote walkability polygons:", err);
  }
}




// -----------------------------------------------------------------------------
// SHOW / HIDE BY ZOOM
// -----------------------------------------------------------------------------
function hideWalkabilityLayer() {
  if (map.getLayer("walkability-layer"))
    map.setLayoutProperty("walkability-layer", "visibility", "none");
  if (map.getLayer("walkability-outline"))
    map.setLayoutProperty("walkability-outline", "visibility", "none");
}

function showWalkabilityLayer() {
  if (map.getLayer("walkability-layer"))
    map.setLayoutProperty("walkability-layer", "visibility", "visible");
  if (map.getLayer("walkability-outline"))
    map.setLayoutProperty("walkability-outline", "visibility", "visible");
}

map.on("zoomend", () => {
  if (isResetting) return;

  if (map.getZoom() >= 8) {
    showWalkabilityLayer();
  } else {
    hideWalkabilityLayer();
    map.setFilter("walkability-outline", null);
    map.setPaintProperty("walkability-outline", "line-color", "#fff");
    map.setPaintProperty("walkability-outline", "line-width", 0);
  }
});


// -----------------------------------------------------------------------------
// BLOCK POPUP ON HOVER
// -----------------------------------------------------------------------------
// Create a reusable popup
let hoverPopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  offset: 10
});

// Mousemove handler
let hoverTimeout = null;
let lastHoveredGeoid = null;

const hoverLayers = ["walkability-layer", "remote-walkability-layer"];

hoverLayers.forEach(layerId => {
  map.on("mousemove", layerId, (e) => {
    if (!e.features || !e.features.length) return;

    const feature = e.features[0];
    const selectedVar = document.getElementById("colorVar").value;
    const geoid = feature.properties.GEOID20;

    if (lastHoveredGeoid === geoid) return;

    if (hoverTimeout) clearTimeout(hoverTimeout);

    hoverTimeout = setTimeout(() => {
      lastHoveredGeoid = geoid;

      let source = layerId === "walkability-layer" ? "walkability-outline" : "remote-walkability-outline";
      highlightBlockGroup(geoid, source, false);

      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(`
          <strong>Block Group:</strong> ${geoid}<br/>
          <strong>Walkability Index:</strong> ${Number(feature.properties.NatWalkInd).toFixed(2)}<br/>
          <strong>${selectedVar}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}
        `)
        .addTo(map);

      showWalkabilityLayer();

      if (!pinnedBlockGeoid) {
        updateInfoBox(feature); // show hover info only if no pinned block
      } else {
        updateInfoBox(pinnedBlockFeature); // always show pinned block info
      }

    }, 100);
  });

  map.on("mouseleave", layerId, () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverPopup.remove();
    // Only unhighlight if nothing is pinned
  if (pinnedBlockGeoid) {
    highlightBlockGroup(pinnedBlockGeoid, pinnedBlockSource, true);
  } else {
    unhighlightBlockGroup();
    lastHoveredGeoid = null;
    }
  });
});


// ============================================================================
// 📌 AUTOCOMPLETE (MapTiler) + GEOCODE (Census) + HIGHLIGHT BG
// ============================================================================

// HTML elements for autocomplete
const addressInput = document.getElementById("addressInput");
const autocompleteList = document.getElementById("autocompleteList");

let autocompleteTimeout = null;
let addressMarker = null;


// -----------------------------------------------------------------------------
// AUTOCOMPLETE USING MAPTILER API
// -----------------------------------------------------------------------------
addressInput.addEventListener("input", () => {
  const query = addressInput.value.trim();

  if (query.length < 3) {
    autocompleteList.style.display = "none";
    return;
  }

  if (autocompleteTimeout) clearTimeout(autocompleteTimeout);

  autocompleteTimeout = setTimeout(async () => {
    const url =
      `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json` +
      `?key=WRaHA83n4MbC5JM8vMFl&autocomplete=true&limit=5&country=US`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) {
      autocompleteList.style.display = "none";
      return;
    }

    autocompleteList.innerHTML = "";
    data.features.forEach(feature => {
      const item = document.createElement("div");
      item.textContent = feature.place_name;
      item.style.padding = "6px";
      item.style.cursor = "pointer";
      item.style.borderBottom = "1px solid #eee";

      item.onclick = () => {
        addressInput.value = feature.place_name;
        autocompleteList.style.display = "none";
        geocodeAndZoomMapTiler(feature.place_name);
      };

      autocompleteList.appendChild(item);
    });

    autocompleteList.style.display = "block";
  }, 250);
});


// -----------------------------------------------------------------------------
// "Go" BUTTON + ADDRESS SEARCH (MapTiler Geocoding)
// -----------------------------------------------------------------------------
const goButton = document.getElementById("goAddressBtn"); // Make sure you have a button in HTML
const searchAddressInput = document.getElementById("addressInput");

let searchAddressMarker = null;

goButton.addEventListener("click", async () => {
  const fullAddress = searchAddressInput.value.trim();
  if (!fullAddress) return;

  await geocodeAndZoomMapTiler(fullAddress);
});


// -----------------------------------------------------------------------------
// GEOCODE & ZOOM USING MAPTILER
// -----------------------------------------------------------------------------
async function geocodeAndZoomMapTiler(fullAddress) {
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(fullAddress)}.json` +
                `?key=WRaHA83n4MbC5JM8vMFl&country=US&limit=1`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) {
      alert("Address not found in the US.");
      return;
    }

    const feature = data.features[0];
    const [lon, lat] = feature.geometry.coordinates;

    // Remove previous marker
    if (addressMarker) addressMarker.remove();

    // Add new marker
    addressMarker = new maplibregl.Marker({ color: "#ff0000" })
      .setLngLat([lon, lat])
      .addTo(map);

    // Fly to the location
    flyAndThen(map, { center: [lon, lat], zoom: 15, speed: 0.7 }, async () => {
      zoomLocked = true;
      map.setMinZoom(12);

      // Hide city markers
      Object.values(cityMarkers).forEach(m => {
        if (m.isVisible) {
          m.remove();
          m.isVisible = false;
        }
      });

      if (!map.hasControl(navControl)) {
        map.addControl(navControl, "top-right");
      }

      // First, check if this point exists locally
      let geoid = findBlockByCoordinates(lon, lat);
      source = "walkability-outline";
      if (!geoid) {
        // Define a small bounding box around the point (e.g., ~0.01 degrees)
        const buffer = 0.05;
        const bounds = new maplibregl.LngLatBounds(
          [lon - buffer, lat - buffer],
          [lon + buffer, lat + buffer]
        );

        // Fetch remote polygons within bounds (avoiding duplicates)
        await fetchWalkabilityInBounds(bounds);

        // Try finding the block again after fetching
        geoid = findBlockByCoordinates(lon, lat);
        source = "remote-walkability-outline";

      }

      if (geoid) {
        block_feature = fetchedFeaturesCache[geoid] || currentWalkabilityData.features.find(f => f.properties.GEOID20 === geoid);
        pinBlock(geoid, source, block_feature, fullAddress);
        updateInfoBox(block_feature, fullAddress);
        console.log("Pinned block group:", geoid);
      } else {
        console.warn("No polygon found containing this address");
      }
    });

  } catch (err) {
    console.error("Geocoding failed:", err);
    alert("Failed to geocode address. Try again.");
  }
}


// -----------------------------------------------------------------------------
// FIND BLOCK BY COORDINATES
// -----------------------------------------------------------------------------
function findBlockByCoordinates(lon, lat) {
  if (!currentWalkabilityData) return null;

  const pt = turf.point([lon, lat]);

  for (const feature of currentWalkabilityData.features) {
    if (turf.booleanPointInPolygon(pt, feature)) {
      return feature.properties.GEOID20;
    }
  }

  return null;
}


// -----------------------------------------------------------------------------
// HIGHLIGHT BLOCK GROUP
// -----------------------------------------------------------------------------
function highlightBlockGroup(geoid, source="walkability-outline", pinned=false) {
  const outlineLayer = source === "walkability-outline" ? "walkability-outline" : "remote-walkability-outline";

  if (!map.getLayer(outlineLayer)) return;

  map.setLayoutProperty(outlineLayer, "visibility", "visible");
  geoid = String(geoid).padStart(12, "0");
  map.setFilter(outlineLayer, ["==", ["to-string", ["get", "GEOID20"]], geoid]);

  const color = pinned ? "#ff9900ff" : "#ddff00ff";
  map.setPaintProperty(outlineLayer, "line-color", color);
  map.setPaintProperty(outlineLayer, "line-width", pinned ? 3 : 2);
}


function unhighlightBlockGroup() {
  showWalkabilityLayer();

  map.setPaintProperty("walkability-outline", "line-color", "#ffffff");
  map.setPaintProperty("walkability-outline", "line-width", 0);
  map.setPaintProperty("remote-walkability-outline", "line-color", "#ffffff");
  map.setPaintProperty("remote-walkability-outline", "line-width", 0);
}

// --------------------------
// Pin block (keeps info box)
// --------------------------
let pinnedBlockGeoid = null;
let pinnedBlockSource = null;
let pinnedBlockFeature = null;
let pinnedBlockAddress = null;

function pinBlock(geoid, source, feature, address) {
  
  pinnedBlockGeoid = geoid;
  pinnedBlockSource = source;
  pinnedBlockFeature = feature;
  pinnedBlockAddress = address;
  console.log(pinnedBlockGeoid, pinnedBlockSource, pinnedBlockFeature);

  // Highlight pinned block in pinned color
  highlightBlockGroup(geoid, source, true);

  // Keep info box for pinned block
  updateInfoBox(feature, address);
}

function updateInfoBox(feature, address=null) {
  if (!feature) return;
  const selectedVar = document.getElementById("colorVar").value;
  const infoBox = document.getElementById("infoContent");
  
  // update info box if feature is not from pinned block
  if (feature.properties.GEOID20 !== pinnedBlockGeoid) {
  infoBox.innerHTML = `
    <p><strong>Block Group:</strong> ${feature.properties.GEOID20}</p>
    <p><strong>Walkability Index:</strong> ${Number(feature.properties.NatWalkInd).toFixed(2)}</p>
    <p><strong>${selectedVar}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}</p>
  `;
  }
  else {
    infoBox.innerHTML = `
    <p><strong>Pinned Block Group:</strong> ${feature.properties.GEOID20}</p>
    <p><strong>Walkability Index:</strong> ${Number(feature.properties.NatWalkInd).toFixed(2)}</p>
    <p><strong>${selectedVar}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}</p>
    <button id="unpinBlockBtn">Unpin Block</button>
  `;
  };
}


// --------------------------
// Unpin block
// --------------------------
function unpinBlock() {
  if (!pinnedBlockGeoid) return;
  pinnedBlockGeoid = null;
  pinnedBlockSource = null;
  pinnedBlockFeature = null;
  unhighlightBlockGroup();
}