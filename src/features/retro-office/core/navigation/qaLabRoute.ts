import type { FacingPoint, QaLabRoute } from "@/features/retro-office/core/types";
import {
  EAST_WING_DOOR_Y,
  EAST_WING_ROOM_HEIGHT,
  EAST_WING_ROOM_TOP_Y,
  QA_LAB_END_X,
  QA_LAB_X,
  QA_LAB_WIDTH,
} from "@/features/retro-office/core/constants";

export const QA_LAB_DEFAULT_TARGET = {
  x: 1330,
  y: 750,
  facing: -Math.PI / 2,
};

const QA_LAB_DOOR_OUTER_TARGET = {
  x: 1330,
  y: 870,
  facing: -Math.PI / 2,
};

const QA_LAB_DOOR_INNER_TARGET = {
  x: 1330,
  y: 820,
  facing: -Math.PI / 2,
};

const DOOR_APPROACH_RADIUS = 60;
const DOOR_INNER_SNAP_RADIUS = 18;

export const resolveQaLabRoute = (
  x: number,
  y: number,
  stationTarget: FacingPoint = QA_LAB_DEFAULT_TARGET,
): QaLabRoute => {
  const insideLab =
    (x >= 1190 && x <= 1470 && y >= 660 && y <= 830) ||
    Math.hypot(
      x - QA_LAB_DOOR_INNER_TARGET.x,
      y - QA_LAB_DOOR_INNER_TARGET.y,
    ) < DOOR_INNER_SNAP_RADIUS;
  if (insideLab) {
    return {
      stage: "station",
      targetX: stationTarget.x,
      targetY: stationTarget.y,
      facing: stationTarget.facing,
    };
  }

  const withinDoorThreshold =
    Math.hypot(
      x - QA_LAB_DOOR_OUTER_TARGET.x,
      y - QA_LAB_DOOR_OUTER_TARGET.y,
    ) < DOOR_APPROACH_RADIUS;
  if (withinDoorThreshold) {
    return {
      stage: "door_inner",
      targetX: QA_LAB_DOOR_INNER_TARGET.x,
      targetY: QA_LAB_DOOR_INNER_TARGET.y,
      facing: QA_LAB_DOOR_INNER_TARGET.facing,
    };
  }

  return {
    stage: "door_outer",
    targetX: QA_LAB_DOOR_OUTER_TARGET.x,
    targetY: QA_LAB_DOOR_OUTER_TARGET.y,
    facing: QA_LAB_DOOR_OUTER_TARGET.facing,
  };
};
