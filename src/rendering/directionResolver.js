"use strict";

export const EIGHT_DIRECTIONS = [
  "south",
  "southwest",
  "west",
  "northwest",
  "north",
  "northeast",
  "east",
  "southeast"
];

const DIRECTION_ANGLES = {
  east: 0,
  southeast: Math.PI / 4,
  south: Math.PI / 2,
  southwest: Math.PI * 3 / 4,
  west: Math.PI,
  northwest: -Math.PI * 3 / 4,
  north: -Math.PI / 2,
  northeast: -Math.PI / 4
};

export function angleToEightDirection(angle) {
  const normalized = normalizeAngle(angle);
  const octant = Math.round(normalized / (Math.PI / 4));
  const wrapped = (octant + 8) % 8;
  return ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"][wrapped];
}

export function vectorToEightDirection(x, y, fallback = "south", deadZone = 0.001) {
  if (Math.hypot(x, y) <= deadZone) return fallback;
  return angleToEightDirection(Math.atan2(y, x));
}

export class EightDirectionResolver {
  constructor(initialDirection = "south", options = {}) {
    this.direction = initialDirection;
    this.deadZone = options.deadZone ?? 0.001;
    this.boundaryHoldRadians = options.boundaryHoldRadians ?? Math.PI / 32;
  }

  resolveVector(x, y) {
    if (Math.hypot(x, y) <= this.deadZone) return this.direction;

    const next = vectorToEightDirection(x, y, this.direction, this.deadZone);
    if (next !== this.direction && this.isNearSharedBoundary(Math.atan2(y, x), next, this.direction)) {
      return this.direction;
    }

    this.direction = next;
    return this.direction;
  }

  setDirection(direction) {
    if (EIGHT_DIRECTIONS.includes(direction)) this.direction = direction;
  }

  isNearSharedBoundary(angle, next, previous) {
    const nextAngle = DIRECTION_ANGLES[next];
    const previousAngle = DIRECTION_ANGLES[previous];
    if (nextAngle === undefined || previousAngle === undefined) return false;

    let difference = normalizeAngle(nextAngle - previousAngle);
    if (Math.abs(Math.abs(difference) - Math.PI / 4) > 0.0001) return false;

    const boundary = normalizeAngle(previousAngle + difference / 2);
    return Math.abs(shortestAngleDistance(angle, boundary)) < this.boundaryHoldRadians;
  }
}

function normalizeAngle(angle) {
  let value = angle;
  while (value < 0) value += Math.PI * 2;
  while (value >= Math.PI * 2) value -= Math.PI * 2;
  return value;
}

function shortestAngleDistance(a, b) {
  let value = normalizeAngle(a) - normalizeAngle(b);
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}
