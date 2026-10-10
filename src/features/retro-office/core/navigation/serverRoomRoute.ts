import type { ServerRoomRoute } from "@/features/retro-office/core/types";

export const SERVER_ROOM_TARGET = {
  x: 1270,
  y: 780,
  facing: 0,
};

const SERVER_ROOM_DOOR_OUTER_TARGET = {
  x: 1270,
  y: 870,
  facing: 0,
};

const SERVER_ROOM_DOOR_INNER_TARGET = {
  x: 1270,
  y: 820,
  facing: 0,
};

const DOOR_APPROACH_RADIUS = 60;

export const resolveServerRoomRoute = (
  x: number,
  y: number,
): ServerRoomRoute => {
  const insideRoom =
    (x >= 1190 && x <= 1470 && y >= 660 && y <= 830) ||
    Math.hypot(
      x - SERVER_ROOM_DOOR_INNER_TARGET.x,
      y - SERVER_ROOM_DOOR_INNER_TARGET.y,
    ) < 18;
  if (insideRoom) {
    return {
      stage: "terminal",
      targetX: SERVER_ROOM_TARGET.x,
      targetY: SERVER_ROOM_TARGET.y,
      facing: SERVER_ROOM_TARGET.facing,
    };
  }

  const withinDoorThreshold =
    Math.hypot(
      x - SERVER_ROOM_DOOR_OUTER_TARGET.x,
      y - SERVER_ROOM_DOOR_OUTER_TARGET.y,
    ) < DOOR_APPROACH_RADIUS;
  if (withinDoorThreshold) {
    return {
      stage: "door_inner",
      targetX: SERVER_ROOM_DOOR_INNER_TARGET.x,
      targetY: SERVER_ROOM_DOOR_INNER_TARGET.y,
      facing: SERVER_ROOM_DOOR_INNER_TARGET.facing,
    };
  }

  return {
    stage: "door_outer",
    targetX: SERVER_ROOM_DOOR_OUTER_TARGET.x,
    targetY: SERVER_ROOM_DOOR_OUTER_TARGET.y,
    facing: SERVER_ROOM_DOOR_OUTER_TARGET.facing,
  };
};
