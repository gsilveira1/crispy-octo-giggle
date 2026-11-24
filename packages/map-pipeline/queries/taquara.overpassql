[out:json][timeout:180][bbox:-29.69,-50.83,-29.61,-50.73];
(
  way["highway"];
  way["building"];
  nwr["landuse"];
  nwr["leisure"];
  nwr["natural"~"water|wood|scrub|grassland|wetland"];
  nwr["waterway"];
  nwr["amenity"];
  nwr["shop"];
  nwr["tourism"];
  node["place"];
  way["railway"];
  relation["boundary"="administrative"]["admin_level"~"^(8|10)$"];
);
out body geom qt;
