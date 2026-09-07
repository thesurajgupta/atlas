/**
 * Spherical geometry helpers for the map surfaces.
 *
 * Everything here works on a sphere of mean Earth radius, not an ellipsoid.
 * The error is under ~0.3% — around 40 m over a 14 km search radius, well
 * inside the uncertainty of the thing being drawn — and the alternative pulls
 * in a projection library for no gain the operator can see.
 */

/** IUGG mean radius, in kilometres. */
const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export interface LatLon {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * The point `distanceKm` away from `origin` along `bearingDegrees`, measured
 * clockwise from true north.
 *
 * Used to derive endpoint positions from a search radius rather than storing
 * both a coordinate and a distance. Two fields that must agree and are not
 * derived from each other will eventually disagree; this makes the map
 * position and the distance column the same fact.
 */
export function destinationPoint(
  origin: LatLon,
  bearingDegrees: number,
  distanceKm: number,
): LatLon {
  const angular = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDegrees);
  const latitude = toRadians(origin.latitude);
  const longitude = toRadians(origin.longitude);

  const sinLatitude =
    Math.sin(latitude) * Math.cos(angular) +
    Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing);
  const destinationLatitude = Math.asin(sinLatitude);

  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
      Math.cos(angular) - Math.sin(latitude) * sinLatitude,
    );

  return {
    latitude: toDegrees(destinationLatitude),
    // Normalise back into [-180, 180]; a ring drawn across the antimeridian
    // otherwise wraps the long way round the world.
    longitude: ((toDegrees(destinationLongitude) + 540) % 360) - 180,
  };
}

/**
 * A closed ring of `[lon, lat]` pairs at a constant `radiusKm` from `centre`.
 *
 * A true circle on the ground, not a circle on the screen: at Indian latitudes
 * a Web Mercator view stretches it noticeably north–south, and that stretch is
 * the honest depiction — a screen-space circle would claim a 10 km radius that
 * is only 8 km at the top.
 */
export function geodesicCircle(
  centre: LatLon,
  radiusKm: number,
  segments = 128,
): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const point = destinationPoint(centre, (i / segments) * 360, radiusKm);
    ring.push([point.longitude, point.latitude]);
  }
  return ring;
}

/** Great-circle distance between two points, in kilometres. */
export function distanceKm(from: LatLon, to: LatLon): number {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
