# load in gdb data
import geopandas as gpd
import pandas as pd
import os
import json

# Set input and output file paths
gdb_path = os.path.join("data", "SmartLocationDatabase.gdb")
gdb_path
output_geojson_path = os.path.join("data", "walkability.geojson")
gdf = gpd.read_file(gdb_path)

# filter out blocks with population zero
gdf = gdf[gdf["TotPop"] > 0]
gdf = gdf.to_crs(4326) 

ny = gdf[gdf["CBSA"] == "35620"]
la = gdf[gdf["CBSA"] == "31080"]
chi = gdf[gdf["CBSA"] == "16980"]
hou = gdf[gdf["CBSA"] == "26420"]
dal = gdf[gdf["CBSA"] == "19100"]

gdf = pd.concat([ny, la, chi, hou, dal])
# convert to geojson
gdf.to_file(output_geojson_path, driver="GeoJSON")
# Verify by loading the geojson file    
with open(output_geojson_path) as f:
    data = json.load(f)
    print(data.keys())