
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const collection = feature(
  world,
  world.objects.countries
);

export const countries = collection.features
  .filter((country) => country.properties?.name)
  .sort((a, b) =>
    a.properties.name.localeCompare(b.properties.name)
  );

export function findCountry(countryId) {
  return countries.find(
    (country) => String(country.id) === String(countryId)
  ) || null;
}

export function isInsideCountry(fire, country) {
  if (!country) return true;

  const lat = Number(fire.latitude);
  const lon = Number(fire.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  try {
    return booleanPointInPolygon(
      [lon, lat],
      country
    );
  } catch (error) {
    console.error("Country geometry error:", error);
    return false;
  }
}
