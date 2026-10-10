import type { FacingPoint, GymRoute } from "@/features/retro-office/core/types";
import {
  EAST_WING_DOOR_Y,
  EAST_WING_ROOM_HEIGHT,
  EAST_WING_ROOM_TOP_Y,
  GYM_ROOM_END_X,
  GYM_ROOM_WIDTH,
  GYM_ROOM_X,
} from "@/features/retro-office/core/constants";

export const GYM_DEFAULT_TARGET = {
  x: 1330,
  y: 330,
  facing: -Math.PI / 2,
};

const GYM_DOOR_OUTER_TARGET = {
  x: 1330,
  y: 450,
  facing: -Math.PI / 2,
};

const GYM_DOOR_INNER_TARGET = {
  x: 1330,
  y: 400,
  facing: -Math.PI / 2,
};

const DOOR_APPROACH_RADIUS = 60;
const DOOR_INNER_SNAP_RADIUS = 18;

export const resolveGymRoute = (
  x: number,
  y: number,
  workoutTarget: FacingPoint = GYM_DEFAULT_TARGET,
): GymRoute => {
  const insideGym =
    (x >= 1190 && x <= 1470 && y >= 240 && y <= 410) ||
    Math.hypot(
      x - GYM_DOOR_INNER_TARGET.x,
      y - GYM_DOOR_INNER_TARGET.y,
    ) < DOOR_INNER_SNAP_RADIUS;
  if (insideGym) {
    return {
      stage: "workout",
      targetX: workoutTarget.x,
      targetY: workoutTarget.y,
      facing: workoutTarget.facing,
    };
  }

  const withinDoorThreshold =
    Math.hypot(
      x - GYM_DOOR_OUTER_TARGET.x,
      y - GYM_DOOR_OUTER_TARGET.y,
    ) < DOOR_APPROACH_RADIUS;
  if (withinDoorThreshold) {
    return {
      stage: "door_inner",
      targetX: GYM_DOOR_INNER_TARGET.x,
      targetY: GYM_DOOR_INNER_TARGET.y,
      facing: GYM_DOOR_INNER_TARGET.facing,
    };
  }

  return {
    stage: "door_outer",
    targetX: GYM_DOOR_OUTER_TARGET.x,
    targetY: GYM_DOOR_OUTER_TARGET.y,
    facing: GYM_DOOR_OUTER_TARGET.facing,
  };
};
