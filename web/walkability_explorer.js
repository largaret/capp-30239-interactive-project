// -----------------------------------------------------------------------------
// INITIAL MAP
// -----------------------------------------------------------------------------
const map = new maplibregl.Map({
  container: "map",
  style: "https://api.maptiler.com/maps/019acc55-20fb-789b-818a-8874d992c0e3/style.json?key=WRaHA83n4MbC5JM8vMFl",
  center: [-98, 39],
  zoom: 3,
  minZoom: 3
});

map.addControl(new maplibregl.NavigationControl(), "top-right");


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
// UTILITY: flyTo BUT WAIT FOR MOVEEND BEFORE RUNNING CALLBACK
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

        // Use safe flyAndThen wrapper
        flyAndThen(map, { center: city.coords, zoom: 10, speed: 0.6 }, () => {
          zoomLocked = true;
          map.setMinZoom(8);     // Prevent zooming out past 8
          const marker = cityMarkers[city.id];
          marker.remove();
          marker.isVisible = false;
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
// RESET VIEW BUTTON
// -----------------------------------------------------------------------------
document.getElementById("resetViewBtn").addEventListener("click", () => {
  isResetting = true;

  flyAndThen(map, { center: [-98, 39], zoom: 3, speed: 0.6 }, () => {
    isResetting = false;

    // unlock zoom
    zoomLocked = false;
    map.setMinZoom(3);

    // restore markers
    Object.values(cityMarkers).forEach(marker => {
      if (!marker.isVisible) {
        marker.addTo(map);
        marker.isVisible = true;
      }
    });

    hideWalkabilityLayer();
  });
});


// -----------------------------------------------------------------------------
// AUTO COLOR SCALING
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
// LOAD LOCAL GEOJSON
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
      "fill-opacity": 0.5
    },
    layout: { "visibility": "none" }
  });

  map.addLayer({
    id: "walkability-outline",
    type: "line",
    source: "walkability",
    paint: { "line-color": "#000", "line-width": 0.5 },
    layout: { "visibility": "none" }
  });
});


// -----------------------------------------------------------------------------
// SHOW / HIDE BY ZOOM — WITH RESET PROTECTION
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

  if (map.getZoom() >= 8) showWalkabilityLayer();
  else hideWalkabilityLayer();
});


// -----------------------------------------------------------------------------
// Block popup
// -----------------------------------------------------------------------------
map.on("click", "walkability-layer", (e) => {
  const p = e.features[0].properties;
  const selectedVar = document.getElementById("colorVar").value;

  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`
      <strong>Walkability Index:</strong> ${p.NatWalkInd}<br/>
      <strong>Block Group:</strong> ${p.GEOID10}<br/>
      <strong>${selectedVar}:</strong> ${p[selectedVar]}
    `)
    .addTo(map);
});
