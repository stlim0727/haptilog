export type ClusterPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type MapCluster<T> = {
  latitude: number;
  longitude: number;
  members: T[];
  /** Members share one coordinate, so zooming in cannot separate them. */
  coLocated: boolean;
};

const TILE_SIZE = 256;
// Pins are 44px wide, so groups closer than this already overlap on screen.
export const CLUSTER_RADIUS_PX = 64;
// Above this zoom GPS noise is smaller than a real distance between places.
export const CLUSTER_MAX_ZOOM = 18;

function projectX(longitude: number, scale: number) {
  return ((longitude + 180) / 360) * scale;
}

function projectY(latitude: number, scale: number) {
  // Clamped like Web Mercator so the poles stay a finite distance from anything.
  const sine = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale;
}

function unprojectX(x: number, scale: number) {
  return (x / scale) * 360 - 180;
}

function unprojectY(y: number, scale: number) {
  const tangent = Math.exp(Math.PI - (2 * Math.PI * y) / scale);
  return (2 * Math.atan(tangent) - Math.PI / 2) * (180 / Math.PI);
}

export function clusterLocations<T extends ClusterPoint>(
  points: T[],
  zoom: number,
  radiusPx = CLUSTER_RADIUS_PX,
): MapCluster<T>[] {
  const radius = zoom > CLUSTER_MAX_ZOOM ? 0 : radiusPx;
  const scale = TILE_SIZE * 2 ** zoom;
  const cell = Math.max(radius, 1);
  const projected = points.map((point) => ({
    point,
    x: projectX(point.longitude, scale),
    y: projectY(point.latitude, scale),
  }));

  const grid = new Map<string, number[]>();
  projected.forEach((entry, index) => {
    const key = `${Math.floor(entry.x / cell)}:${Math.floor(entry.y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  });

  const claimed = projected.map(() => false);
  const clusters: MapCluster<T>[] = [];
  for (let index = 0; index < projected.length; index++) {
    if (claimed[index]) continue;
    claimed[index] = true;
    const anchor = projected[index];
    const members = [anchor.point];
    let sumX = anchor.x;
    let sumY = anchor.y;
    const cellX = Math.floor(anchor.x / cell);
    const cellY = Math.floor(anchor.y / cell);
    // A point within `radius` can only sit in the anchor's own or a facing cell.
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (const candidate of grid.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? []) {
          if (claimed[candidate]) continue;
          const other = projected[candidate];
          if (Math.hypot(other.x - anchor.x, other.y - anchor.y) > radius) continue;
          claimed[candidate] = true;
          members.push(other.point);
          sumX += other.x;
          sumY += other.y;
        }
      }
    }
    if (members.length === 1) {
      clusters.push({
        latitude: anchor.point.latitude,
        longitude: anchor.point.longitude,
        members,
        coLocated: true,
      });
      continue;
    }
    const coLocated = members.every(
      (member) => member.latitude === anchor.point.latitude &&
        member.longitude === anchor.point.longitude,
    );
    clusters.push({
      latitude: coLocated ? anchor.point.latitude : unprojectY(sumY / members.length, scale),
      longitude: coLocated ? anchor.point.longitude : unprojectX(sumX / members.length, scale),
      members,
      coLocated,
    });
  }
  return clusters;
}
