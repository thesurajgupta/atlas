import { describe, expect, it } from 'vitest';

import { destinationPoint, distanceKm, geodesicCircle } from './geo';

/**
 * The cash-out map derives every marker position from a bearing and a distance,
 * so these two functions are what makes the map agree with the distance column
 * beside it. A silent error here would not crash anything — it would just draw
 * an endpoint at the wrong range, which is the one thing the screen must not do.
 */

const DELHI = { latitude: 28.6139, longitude: 77.209 };

describe('destinationPoint', () => {
  it('lands at the requested distance, whatever the bearing', () => {
    for (const bearing of [0, 34, 118, 205, 302, 359]) {
      const destination = destinationPoint(DELHI, bearing, 14.2);
      expect(distanceKm(DELHI, destination)).toBeCloseTo(14.2, 6);
    }
  });

  it('sends due north and due east to the right quadrant', () => {
    const north = destinationPoint(DELHI, 0, 10);
    expect(north.latitude).toBeGreaterThan(DELHI.latitude);
    expect(north.longitude).toBeCloseTo(DELHI.longitude, 6);

    const east = destinationPoint(DELHI, 90, 10);
    expect(east.longitude).toBeGreaterThan(DELHI.longitude);
    expect(east.latitude).toBeCloseTo(DELHI.latitude, 3);
  });

  it('keeps longitude in range across the antimeridian', () => {
    const nearEdge = { latitude: 0, longitude: 179.9 };
    const crossed = destinationPoint(nearEdge, 90, 200);
    expect(crossed.longitude).toBeGreaterThanOrEqual(-180);
    expect(crossed.longitude).toBeLessThanOrEqual(180);
    expect(crossed.longitude).toBeLessThan(0);
  });
});

describe('geodesicCircle', () => {
  it('closes, and holds the radius all the way round', () => {
    const ring = geodesicCircle(DELHI, 5, 64);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toStrictEqual(ring[64]);

    for (const [longitude, latitude] of ring) {
      expect(distanceKm(DELHI, { latitude, longitude })).toBeCloseTo(5, 6);
    }
  });

  it('is wider than it is tall in degrees, at Indian latitudes', () => {
    // Not a rounding artefact: a degree of longitude is shorter than a degree
    // of latitude away from the equator, so a circle on the ground must span
    // more longitude than latitude. This is the check that the ring is drawn
    // on the sphere rather than in screen space.
    const ring = geodesicCircle(DELHI, 10, 64);
    const longitudes = ring.map(([longitude]) => longitude);
    const latitudes = ring.map(([, latitude]) => latitude);
    const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
    const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
    expect(longitudeSpan).toBeGreaterThan(latitudeSpan * 1.1);
  });
});

describe('distanceKm', () => {
  it('is zero for a point against itself', () => {
    expect(distanceKm(DELHI, DELHI)).toBe(0);
  });

  it('matches a known separation', () => {
    // Delhi to Mumbai, ~1,150 km great-circle.
    const mumbai = { latitude: 19.076, longitude: 72.8777 };
    expect(distanceKm(DELHI, mumbai)).toBeGreaterThan(1130);
    expect(distanceKm(DELHI, mumbai)).toBeLessThan(1170);
  });
});
