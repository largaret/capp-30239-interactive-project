# Maggie Larson

## Description

I want to create an interactive chart which allows users to visualize the different components of the EPA's walkability score separately and in a custom weighted index. These components are intersection density, proximity to transit stops, employment mix and employment and household mix. My vision for the chart is that it can be used to explore how the walkability index is calculated and the results of different choices for the index. It would also be interesting to compare with something like [Walk Score][https://www.walkscore.com/] if I can access the Walk Score API. 

## Technical Plan re: Option A/B/C/D

My planned interactive chart is mostly similar to C, a geospatial visualization, with some additional functionality for calculating the index to display and complementary visualizations of how the selected region compares to all regions. I expect to use the [D3/Observable geo mark][https://observablehq.com/@observablehq/plot-choropleth] to create an interactive choropleth and something like the [D3 select button/update function][https://d3-graph-gallery.com/graph/line_select.html] to provide different options. 

## Mockup

![mockup](<interactive_mockup.jpg>)

Functionality: 
- select a CSA (Combined Statistical Area, eg Chicago-Naperville) from drop-down (or county?)
- choose which of intersection density, proximity to transit stops, employment mix and employment and household mix to display on choropleth
- choose a weighted combination of intersection density, proximity to transit stops, employment mix and employment and household mix to calculate a walkability index and display on choropleth
- for selected variable/index, show where selected CSA falls in histogram of all CSAs over selected variable


## Data Sources

### Data Source 1: EPA Smart Location Database and National Walkability Index

URL: https://www.epa.gov/smartgrowth/smart-location-mapping
Download link: https://edg.epa.gov/EPADataCommons/public/OA/EPA_SmartLocationDatabase_V3_Jan_2021_Final.csv

Size: 220,740 rows, 117 columns

The Smart Location Database (SLD) is a database compiled by the U.S. Environmental Protection Agency (EPA) summarizing demographic, employment and built environment variables at the Census block group level. This dataset includes the National Walkability Index score for each block group calculated based on the "D" variables: residential/employment density, land use diversity, design of the built environment, access to destinations, distance to transit. The SLD also includes demographic data including population count, a breakdown of workers into high-/medium-/low-income groups and number of households with 0, 1 or 2 cars.

I have already worked with this dataset in the static project, but I would like to further explore the variables used to calculate the walkability index. I did find the granularity of the dataset challenging to work with, but I imagine that it will be better suited to an interactive map which allows for zooming in on smaller areas. 

Source: https://www.epa.gov/system/files/documents/2023-10/epa_sld_3.0_technicaldocumentationuserguide_may2021_0.pdf


### Data Source 2: Walk Score (potentially)
URL: https://www.walkscore.com/cities-and-neighborhoods/

This is an alternate walk score rating which is apparently calculated for use in the real estate industry. The methodology isn't clear, but it seems to be relatively widely used and there is an API available for business customers; if it's possible to access this, it might be interesting to compare with the NWI.


## Questions

1. In the static project, visualizations took a long time to render; I'm concerned that offering several options for filtering the data will make the interactive chart very slow to use. How does this usually work in interactive charts? Are filtering/calculations performed at the time the user is interacting with the chart and what performance implications does that have?