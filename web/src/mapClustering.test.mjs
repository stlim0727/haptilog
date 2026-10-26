import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLUSTER_MAX_ZOOM,
  clusterLocations,
  clusterPlaces,
} from "./mapClustering.ts";

const point = (id, latitude, longitude) => ({ id, latitude, longitude });
const ids = (clusters) => clusters.map((c) => c.members.map((m) => m.id).sort());

// 0.003 degrees of latitude is about 334 m: one group at zoom 12, two at zoom 15.
const near = point("a", 37.541, 127.056);

test("groups nearby places into one cluster with a count", () => {
  const clusters = clusterLocations(
    [near, point("b", 37.544, 127.056), point("far", 37.58, 127.1)],
    12,
  );
  assert.equal(clusters.length, 2);
  assert.deepEqual(ids(clusters).sort(), [["a", "b"], ["far"]]);
  const group = clusters.find((c) => c.members.length === 2);
  assert.equal(group.coLocated, false);
  assert.ok(group.latitude > 37.541 && group.latitude < 37.544);
});

test("the same points split apart when the user zooms in", () => {
  const zoomed = clusterLocations([near, point("b", 37.544, 127.056)], 15);
  assert.equal(zoomed.length, 2);
  assert.deepEqual(ids(zoomed).sort(), [["a"], ["b"]]);
});

test("identical coordinates always share one marker", () => {
  const clusters = clusterLocations(
    [near, point("b", 37.541, 127.056)],
    CLUSTER_MAX_ZOOM + 1,
  );
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].coLocated, true);
  assert.deepEqual(clusters[0].latitude, 37.541);
  assert.deepEqual(clusters[0].longitude, 127.056);
});

test("clustering keeps every recording exactly once", () => {
  const records = [];
  for (let index = 0; index < 400; index++) {
    records.push(point(
      `r${index}`,
      37.49 + Math.random() * 0.1,
      126.98 + Math.random() * 0.14,
    ));
  }
  for (const zoom of [10, 13, 16, 19]) {
    const clusters = clusterLocations(records, zoom);
    const flattened = clusters.flatMap((c) => c.members.map((m) => m.id));
    assert.equal(flattened.length, records.length);
    assert.equal(new Set(flattened).size, records.length);
    assert.ok(clusters.length <= records.length);
    if (zoom > CLUSTER_MAX_ZOOM) {
      assert.ok(clusters.every((c) => c.coLocated || c.members.length === 1));
    }
  }
});

test("singles keep their exact coordinates instead of a centroid", () => {
  const [cluster] = clusterLocations([near], 12);
  assert.equal(cluster.latitude, near.latitude);
  assert.equal(cluster.longitude, near.longitude);
});

test("place groups merge stops a short walk apart", () => {
  // 0.0011 degrees of longitude at 37.5N is about 97 m, 0.0051 is about 450 m.
  const groups = clusterPlaces([
    point("cafe", 37.541, 127.056),
    point("same-cafe", 37.541, 127.0571),
    point("across-street", 37.541, 127.0611),
  ]);
  assert.deepEqual(ids(groups).sort(), [
    ["across-street"],
    ["cafe", "same-cafe"],
  ]);
});

test("place groups measure ground distance at any latitude", () => {
  // 0.003 degrees of longitude spans ~167 m of ground at 60N, but Mercator
  // stretches it to ~334 units, so an uncorrected radius would split this stop.
  const merged = clusterPlaces([
    point("a", 60, 10),
    point("b", 60, 10.003),
  ]);
  assert.deepEqual(ids(merged), [["a", "b"]]);
  const apart = clusterPlaces([point("a", 60, 10), point("b", 60, 10.01)]);
  assert.deepEqual(ids(apart).sort(), [["a"], ["b"]]);
});

test("place groups keep every recording exactly once", () => {
  const records = [];
  for (let index = 0; index < 300; index++) {
    records.push(point(
      `r${index}`,
      37.49 + Math.random() * 0.1,
      126.98 + Math.random() * 0.14,
    ));
  }
  const groups = clusterPlaces(records);
  const flattened = groups.flatMap((group) => group.members.map((m) => m.id));
  assert.equal(flattened.length, records.length);
  assert.equal(new Set(flattened).size, records.length);
});
