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
          map.setMinZoom(8);

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

  // Set minZoom low so we can zoom out
  map.setMinZoom(3);

  // Fly to national view smoothly
  flyAndThen(map, {
    center: [-98, 39],
    zoom: 3,
    speed: 0.7,
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

    // Hide walkability layers
    hideWalkabilityLayer();

    // Reset outline styling
    if (map.getLayer("walkability-outline")) {
      map.setFilter("walkability-outline", null);
      map.setPaintProperty("walkability-outline", "line-color", "#fff");
      map.setPaintProperty("walkability-outline", "line-width", 0);
    }

    // Remove address marker if present
    if (addressMarker) {
      addressMarker.remove();
      addressMarker = null;
    }
  });
});


// -----------------------------------------------------------------------------
// AUTO COLOR SCALE
// -----------------------------------------------------------------------------
function getFillColorExpression(selectedVar) {
  if (!currentWalkabilityData) {
    return ["interpolate", ["linear"], ["get", selectedVar], 0, "#ffffcc", 20, "#253494"];
  }

  const values = currentWalkabilityData.features
    .map(f => f.properties?.[selectedVar])
    .filter(v => typeof v === "number" && !isNaN(v));

  if (values.length === 0) {
    return ["interpolate", ["linear"], ["get", selectedVar], 0, "#ffffcc", 20, "#253494"];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

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
});


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

map.on("mousemove", "walkability-layer", (e) => {
  if (!e.features || !e.features.length) return;

  const feature = e.features[0];
  const selectedVar = document.getElementById("colorVar").value;
  const geoid = feature.properties.GEOID20;

  // Avoid redundant updates
  if (lastHoveredGeoid === geoid) return;
  
    // Clear previous timeout
  if (hoverTimeout) clearTimeout(hoverTimeout);

  // Set a delay
  hoverTimeout = setTimeout(() => {
    lastHoveredGeoid = geoid;

    // Set popup content and location
    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(`
        <strong>Block Group:</strong> ${feature.properties.GEOID20}<br/>
        <strong>Walkability Index:</strong> ${Number(feature.properties.NatWalkInd).toFixed(2)}<br/>
        <strong>${selectedVar}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}
      `)
      .addTo(map);

    // Display info in info box
    const infoBox = document.getElementById("infoContent");
    infoBox.innerHTML = `
      <p><strong>Block Group:</strong> ${feature.properties.GEOID20}</p>
      <p><strong>Walkability Index:</strong> ${Number(feature.properties.NatWalkInd).toFixed(2)}</p>
      <p><strong>${selectedVar}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}</p>
    `;

    // Highlight the polygon
    showWalkabilityLayer();
    highlightBlockGroup(feature.properties.GEOID20);
      }, 100); // 100ms delay
});

// Mouse leave handler
map.on("mouseleave", "walkability-layer", () => {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverPopup.remove(); // remove popup
  unhighlightBlockGroup(); // remove highlight
  lastHoveredGeoid = null;
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

    // Remove existing marker
    if (addressMarker) addressMarker.remove();

    // Add marker
    addressMarker = new maplibregl.Marker({ color: "#ff0000" })
      .setLngLat([lon, lat])
      .addTo(map);

    // Fly to address
    flyAndThen(map, { center: [lon, lat], zoom: 15, speed: 0.7 }, () => {
      zoomLocked = true;
      map.setMinZoom(8);

      // Hide city markers
      Object.values(cityMarkers).forEach(m => {
        if (m.isVisible) {
          m.remove();
          m.isVisible = false;
        }
      });

      // Add nav control if not present
      if (!map.hasControl(navControl)) {
        map.addControl(navControl, "top-right");
      }

      // Find the polygon containing the address
      const geoid = findBlockByCoordinates(lon, lat);
      if (geoid) {
        highlightBlockGroup(geoid);
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
      console.log("Found block group:", feature.properties.GEOID20);
      return feature.properties.GEOID20;
    }
  }

  return null;
}


// -----------------------------------------------------------------------------
// HIGHLIGHT BLOCK GROUP
// -----------------------------------------------------------------------------
function highlightBlockGroup(geoid) {
  console.log("Highlighting block group:", geoid);
  // Ensure layer is visible
  if (map.getLayer("walkability-outline")) {
    map.setLayoutProperty("walkability-outline", "visibility", "visible");

    // Set filter
    geoid = String(geoid).padStart(12, "0");
    map.setFilter("walkability-outline", ["==", ["to-string",["get", "GEOID20"]], geoid]);

    // Set styling
    map.setPaintProperty("walkability-outline", "line-color", "#ddff00ff");
    map.setPaintProperty("walkability-outline", "line-width", 2);
  }
}


function unhighlightBlockGroup() {
  showWalkabilityLayer();

  map.setPaintProperty("walkability-outline", "line-color", "#ffffff");
  map.setPaintProperty("walkability-outline", "line-width", 0);
}