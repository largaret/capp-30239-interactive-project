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


function getWalkabilityBucket(score) {
  const walkabilityBuckets = [
    { label: "Least Walkable", bounds: [1, 5.75] },
    { label: "Below Average Walkable", bounds: [5.76, 10.5] },
    { label: "Above Average Walkable", bounds: [10.51, 15.25] },
    { label: "Most Walkable", bounds: [15.26, 20] }
  ];

  for (const bucket of walkabilityBuckets) {
    const [min, max] = bucket.bounds;
    // inclusive ranges on both ends
    if (score >= min && score <= max) {
      return bucket.label;
    }
  }
  return "Unknown";
}

const additionalVars = [
  { key: "D2A_Ranked", label: "Employment and Household Entropy" },
  { key: "D2B_Ranked", label: "Employment Entropy" },
  { key: "D3B_Ranked", label: "Street Intersection Density" },
  { key: "D4A_Ranked", label: "Distance to Nearest Transit Stop" }
];

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
      <h3><a href="#" id="zoom-${city.id}" class="numerator", style="text-decoration:none;">${city.name}</a></h3>
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

  // Reset selection to National Walkability Index
  document.getElementById("colorVar").value = "NatWalkInd";
  map.setPaintProperty("walkability-layer", "fill-color",
    getFillColorExpression("NatWalkInd")
  );
  exitPinnedMode();
  hidePopover("pinned-block-popover");

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
document.getElementById("sidebarSearchBtn").addEventListener("click", () => {
  document.getElementById("resetViewBtn").click();
  hidePopover("onload-popover");
  exitPinnedMode();
  document.getElementById("nwi-info").classList.remove("hidden");
  document.getElementById("nwi-info").focus();
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

// Make each numerator clickable to change the colorVar dropdown
document.querySelectorAll("#nwi-formula .numerator").forEach(el => {
  el.style.cursor = "pointer"; // reinforce that it's clickable
  el.addEventListener("click", () => {
    const variable = el.getAttribute("data-var");
    const dropdown = document.getElementById("colorVar");
    dropdown.value = variable;

    // Trigger the change event if you have a listener on the dropdown
    const event = new Event('change');
    dropdown.dispatchEvent(event);
  });
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


// ----------------------------
// SHOW/HIDE POPUP UTILITY
// ----------------------------
function showPopover(id) {
  document.getElementById(id).classList.remove("hidden");
}

function hidePopover(id) {
  document.getElementById(id).classList.add("hidden");
}

// ----------------------------
// SEARCH BUTTONS
// ----------------------------
// Sidebar search button
document.getElementById("sidebarSearchBtn").addEventListener("click", () => {
  showPopover("search-popover");
});

// Close search button
document.getElementById("close-search-popover").addEventListener("click", () => {
  hidePopover("search-popover");
});

// ----------------------------
// ONLOAD WIZARD
// ----------------------------

let step = 0;

const steps = [
  {
    title: "Welcome!",
    text: "Start here to explore the EPA's Walkability Index."
  },
  {
    title: "The National Walkability Index",
    text: 
    "The National Walkability Index (NWI) was developed by the EPA to assess the effect of the built environment on public health and the environment across the United States."
  },
  {
    title: "Measuring Walkability",
    text: 
    "The National Walkability Index (NWI) is calculated using four measures based on the 'D' variables: residential and employment <em>density</em>, land use <em>diversity</em>, <em>design</em> of the built environment, access to <em>destinations</em>, and <em>distance</em> to transit."
  },
  {
    title: "Get Started",
    text: "Search for an address to continue."
  },
  {
    title: "",
    text: "Each block's NWI score is calculated using this formula. Each variable is a score between 1 and 20 representing a measure of one of the four components - hover over each component to see its meaning."
  },
  {
    title: "",
    text: "You can see how this block compares to its neighbors on...."
  },
    {
    title: "Employment and Household Entropy",
    text: "Employment and household mix influences length and type of commute to work."
  },
  {
    title: "Employment Entropy",
    text: "Employment mix represents the diversity of job types within a given area."
  },
  {
    title: "Street Intersection Density",
    text: "Street intersection density affects the connectivity and walkability of an area."
  },
  {
    title: "Distance to Nearest Transit Stop",
    text: "The distance to the nearest transit stop is used as a measure for the accessibility of public transportation."
  },
  {
    title: "What's next?",
    text: "Use this Explorer to investigate walkability in your area! Search for a specific address using the address search button, or select a city from the map to explore. You can reset the view at any time using the 'Back to US map' button."
  }
];

function renderStep() {
  const s = steps[step];
  document.querySelector("#onload-popover h3").innerHTML = s.title;
  document.querySelector("#onload-popover p").innerHTML = s.text;
}

  document.getElementById("popover-next").addEventListener("click", () => {
    step++;
    if (step === 3) {
      // Show the search popover 
      renderStep();
      showPopover("search-popover");
      document.getElementById("addressInput").focus();
      // disable next button
      document.getElementById("popover-next").disabled = true;
    }
    else if (step === 4) {
      renderStep();
      document.getElementById("nwi-info").classList.remove("hidden");
      document.getElementById("colorVar").focus();
    }
    else if (step === 6) {
      renderStep();
      document.getElementById("colorVar").value = "D2A_Ranked";
      // trigger change event
      const event = new Event('change');
      document.getElementById("colorVar").dispatchEvent(event);
    }
    else if (step === 7) {
      renderStep();
      document.getElementById("colorVar").value = "D2B_Ranked";
      // trigger change event
      const event = new Event('change');
      document.getElementById("colorVar").dispatchEvent(event);
    }
    else if (step === 8) {
      renderStep();
      document.getElementById("colorVar").value = "D3B_Ranked";
      // trigger change event
      const event = new Event('change');
      document.getElementById("colorVar").dispatchEvent(event);
    }
    else if (step === 9) {
      renderStep();
      document.getElementById("colorVar").value = "D4A_Ranked";
      // trigger change event
      const event = new Event('change');
      document.getElementById("colorVar").dispatchEvent(event);
    }
    else if (step === 10) {
      renderStep();
      exitPinnedMode();
      document.getElementById("resetViewBtn").click();
      document.getElementById("popover-next").innerText = "Finish →";
    }
    else if (step >= steps.length) {
      hidePopover("onload-popover");
    } else {
      renderStep();
    }
  });

map.on("load", () => {
  renderStep();
  showPopover("onload-popover");
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

      if (!pinnedBlockGeoid){
        highlightBlockGroup(geoid, source, false);
      }

      // get variable description from selectedvar
      const varDescObj = additionalVars.find(v => v.key === selectedVar);
      if (selectedVar === "NatWalkInd") {
        varDescObj = { label: "NWI Score" };
      }

      console.log(geoid)
      console.log(feature.properties.NatWalkInd)
      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(`
          <h4>${getWalkabilityBucket(Number(feature.properties.NatWalkInd))}</h4>
          <strong>Walkability Index:</strong> ${Number(feature.properties.NatWalkInd).toFixed(2)}<br/>
          <strong>Block Group ID:</strong> ${geoid}<br/>
          <strong>${varDescObj ? varDescObj.label : selectedVar}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}
        `)
        .addTo(map);

      showWalkabilityLayer();

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


hoverLayers.forEach(layerId => {

  map.on("click", layerId, (e) => {
    if (!e.features || !e.features.length) return;

    const feature = e.features[0];
    const geoid = feature.properties.GEOID20;
    const source = layerId === "walkability-layer"
      ? "walkability-outline"
      : "remote-walkability-outline";

    // 👇 CASE 1: user clicks the same polygon → unpin
    if (pinnedBlockGeoid === geoid) {
      exitPinnedMode();
      return;
    }

    // 👇 CASE 2: user clicks a NEW polygon → pin it
    pinnedBlockGeoid = geoid;
    pinnedBlockSource = source;

    // highlight it
    highlightBlockGroup(geoid, source, true);

    // update the info panel
    updatePinnedBox(feature);
    showPopover("pinned-block-popover"); 

    // remove hover popup (since now it's pinned)
    hoverPopup.remove();
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
        hidePopover("search-popover");
        addressInput.value = "";          // clear the input
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

let searchAddressMarker = null;

goButton.addEventListener("click", async () => {
  const fullAddress = addressInput.value.trim();
  addressInput.value = "";          // clear the input
  if (!fullAddress) return;

  hidePopover("search-popover");
  autocompleteList.style.display = "none"; // hide any autocomplete suggestions

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

    document.getElementById("blockAddress").textContent = fullAddress;
    document.getElementById("popover-next").disabled = false;

    // Fly to the location
    // center to left to account for sidebar
    flyAndThen(map, { center: [lon, lat], zoom: 14, speed: 0.7, offset: [-200, 0] }, async () => {
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
        const buffer = 0.1;
        const bounds = new maplibregl.LngLatBounds(
          [lon - buffer, lat - buffer],
          [lon + buffer, lat + buffer]
        );

        // Fetch remote polygons within bounds (avoiding duplicates)
        await fetchWalkabilityInBounds(bounds);

        // Try finding the block again after fetching
        geoid = findBlockByCoordinates(lon, lat);
        source = "remote-walkability-outline";
        console.log("Searched remote features for this address.", geoid);

      }

      if (geoid) {
        console.log("Found block group GEOID for this address:", geoid);
        let block_feature =
          fetchedFeaturesCache[geoid] ||
          currentWalkabilityData.features.find(f => String(f.properties.GEOID20).padStart(12, "0") === geoid) ||
          remoteFeatures.find(f => String(f.properties.GEOID20).padStart(12, "0") === geoid);
        console.log("Found polygon for this address:", block_feature);

        updatePinnedBox(block_feature);
        enterPinnedMode(geoid, source, block_feature, fullAddress);
        showPopover("pinned-block-popover"); 
        showPopover("part2-popover");

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
  const pt = turf.point([lon, lat]);

  // Check local features first
  if (currentWalkabilityData) {
    for (const feature of currentWalkabilityData.features) {
      if (turf.booleanPointInPolygon(pt, feature)) {
        return feature.properties.GEOID20;
      }
    }
  }

  // Then check remote features
  for (const feature of remoteFeatures) {
    if (turf.booleanPointInPolygon(pt, feature)) {
      return feature.properties.GEOID20;
    }
  }

  // Not found
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

  const color = pinned ? "#ff5e00ff" : "#ddff00ff";
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

function enterPinnedMode(geoid, source, feature, address) {
  
  pinnedMode = true;
  pinnedBlockGeoid = geoid;
  pinnedBlockSource = source;
  pinnedBlockFeature = feature;
  pinnedBlockAddress = address;
  console.log(pinnedBlockGeoid, pinnedBlockSource, pinnedBlockFeature);

  // Highlight pinned block in pinned color
  highlightBlockGroup(geoid, source, true);

  updatePinnedBox(feature);
}

function updatePinnedBox(feature) {
  if (!feature) return;
  const selectedVar = document.getElementById("colorVar").value;
  const infoBox = document.getElementById("pinnedBlockInfo");

  // Fill in pinned block info in a table format
  let additionalHTML = additionalVars.map(v => {
    const val = feature.properties[v.key];
    return `<tr><td style="font-size: 0.9em;">${v.label}</td><td>${val}</td></tr>`;
  }).join("");

  let varDescObj = additionalVars.find(v => v.key === selectedVar);
    if (selectedVar === "NatWalkInd") {
      varDescObj = { label: "NWI Score" };
    }

  infoBox.innerHTML = `
    <p><strong>Block Group ID:</strong> ${feature.properties.GEOID20}</p>
    <p>This block group is rated <strong>${getWalkabilityBucket(Number(feature.properties.NatWalkInd))}</strong> with a walkability score of ${Number(feature.properties.NatWalkInd).toFixed(2)}</p>
    <p><strong>${varDescObj.label}:</strong> ${Number(feature.properties[selectedVar]).toFixed(2)}</p>
    <table>${additionalHTML}</table>
  `;
  }


// --------------------------
// Unpin block
// --------------------------
function exitPinnedMode() {
  if (!pinnedBlockGeoid) return;
  pinnedBlockGeoid = null;
  pinnedBlockSource = null;
  pinnedBlockFeature = null;
  pinnedBlockAddress = null;
  pinnedMode = false;
  unhighlightBlockGroup();
  hidePopover("pinned-block-popover"); 
  const infoBox = document.getElementById("pinnedBlockInfo");
  infoBox.innerHTML = "";
}