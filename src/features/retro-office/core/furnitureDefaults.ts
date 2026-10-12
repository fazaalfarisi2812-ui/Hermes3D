import {
  DOOR_LENGTH,
  DOOR_THICKNESS,
  EAST_WING_DOOR_Y,
  EAST_WING_ROOM_HEIGHT,
  EAST_WING_ROOM_TOP_Y,
  GYM_ROOM_END_X,
  GYM_ROOM_X,
  QA_LAB_END_X,
  QA_LAB_X,
  WALL_THICKNESS,
} from "@/features/retro-office/core/constants";
import { nextUid } from "@/features/retro-office/core/geometry";
import {
  hasAtmMigrationApplied,
  hasGymRoomMigrationApplied,
  hasPhoneBoothMigrationApplied,
  hasQaLabMigrationApplied,
  hasSmsBoothMigrationApplied,
  hasServerRoomMigrationApplied,
} from "@/features/retro-office/core/persistence";
import type {
  FurnitureItem,
  FurnitureSeed,
} from "@/features/retro-office/core/types";

export type OfficeLayoutPreset = "office" | "lobby";

const DEFAULT_PINGPONG_TABLE: FurnitureSeed = {
  type: "pingpong",
  x: 1530,
  y: 1050,
  w: 100,
  h: 60,
};

const DEFAULT_ATM_MACHINE: FurnitureSeed = {
  type: "atm",
  x: 1160,
  y: 1030,
  facing: 90,
};

const DEFAULT_PHONE_BOOTH: FurnitureSeed = {
  type: "phone_booth",
  x: 1220,
  y: 520,
  facing: 270,
};

const DEFAULT_SMS_BOOTH: FurnitureSeed = {
  type: "sms_booth",
  x: 1580,
  y: 520,
  facing: 0,
};

const DEFAULT_JUKEBOX: FurnitureSeed = {
  type: "jukebox",
  x: 1580,
  y: 300,
  facing: 90,
};

const DEFAULT_KANBAN_BOARD: FurnitureSeed = {
  type: "kanban_board",
  x: 1160,
  y: 1120,
  facing: 180,
};

const PREVIOUS_SERVER_ROOM_ITEMS_BOTTOM_RIGHT: FurnitureSeed[] = [
  { type: "wall", x: 820, y: 540, w: 280, h: WALL_THICKNESS },
  { type: "wall", x: 820, y: 540, w: WALL_THICKNESS, h: 70 },
  { type: "wall", x: 820, y: 650, w: WALL_THICKNESS, h: 70 },
  {
    type: "door",
    x: 820,
    y: 610,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "server_rack", x: 885, y: 575, facing: 180 },
  { type: "server_rack", x: 955, y: 575, facing: 180 },
  { type: "server_terminal", x: 930, y: 640, facing: 0 },
];

const PREVIOUS_SERVER_ROOM_ITEMS_TOP_RIGHT: FurnitureSeed[] = [
  { type: "wall", x: 820, y: 0, w: WALL_THICKNESS, h: 130 },
  { type: "wall", x: 820, y: 170, w: WALL_THICKNESS, h: 60 },
  {
    type: "door",
    x: 820,
    y: 130,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 820, y: 230, w: 280, h: WALL_THICKNESS },
  { type: "server_rack", x: 875, y: 95, facing: 180 },
  { type: "server_rack", x: 950, y: 95, facing: 180 },
  { type: "server_terminal", x: 930, y: 185, facing: 0 },
];

const DEFAULT_DINING_ITEMS: FurnitureSeed[] = [
  { type: "round_table", x: 890, y: 100, r: 50 },
  { type: "chair", x: 930, y: 100, facing: 0 },
  { type: "chair", x: 930, y: 180, facing: 180 },
  { type: "chair", x: 880, y: 130, facing: 90 },
  { type: "chair", x: 970, y: 130, facing: 270 },
];

const DEFAULT_SERVER_ROOM_ITEMS: FurnitureSeed[] = [
  { type: "server_rack", x: 1230, y: 710, facing: 0 },
  { type: "server_rack", x: 1320, y: 710, facing: 0 },
  { type: "server_terminal", x: 1270, y: 780, facing: 180 },
];

const LEGACY_GYM_ROOM_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 1092, y: 0, w: WALL_THICKNESS, h: 260 },
  {
    type: "door",
    x: 1092,
    y: 260,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 1092, y: 300, w: WALL_THICKNESS, h: 420 },
  { type: "wall", x: 1092, y: 0, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1092, y: 712, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1442, y: 0, w: WALL_THICKNESS, h: 260 },
  {
    type: "door",
    x: 1442,
    y: 260,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 1442, y: 300, w: WALL_THICKNESS, h: 420 },
  { type: "treadmill", x: 1160, y: 90, facing: 90 },
  { type: "treadmill", x: 1160, y: 210, facing: 90 },
  { type: "rowing_machine", x: 1150, y: 340, facing: 90 },
  { type: "weight_bench", x: 1240, y: 120, facing: 90 },
  { type: "weight_bench", x: 1240, y: 260, facing: 90 },
  { type: "dumbbell_rack", x: 1320, y: 90, facing: 180 },
  { type: "dumbbell_rack", x: 1320, y: 220, facing: 180 },
  { type: "kettlebell_rack", x: 1310, y: 330, facing: 180 },
  { type: "exercise_bike", x: 1180, y: 410, facing: 90 },
  { type: "exercise_bike", x: 1180, y: 540, facing: 90 },
  { type: "punching_bag", x: 1360, y: 390, facing: 0 },
  { type: "punching_bag", x: 1360, y: 560, facing: 0 },
  { type: "yoga_mat", x: 1240, y: 470, facing: 0, color: "#0f766e" },
  { type: "yoga_mat", x: 1240, y: 560, facing: 0, color: "#7c3aed" },
  { type: "plant", x: 1400, y: 40 },
  { type: "plant", x: 1400, y: 660 },
];

const LEGACY_QA_LAB_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 1442, y: 0, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1442, y: 712, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1792, y: 0, w: WALL_THICKNESS, h: 720 },
  { type: "qa_terminal", x: 1530, y: 95, facing: 90 },
  { type: "device_rack", x: 1650, y: 90, facing: 180 },
  { type: "device_rack", x: 1650, y: 220, facing: 180 },
  { type: "test_bench", x: 1520, y: 320, facing: 90 },
  { type: "test_bench", x: 1520, y: 470, facing: 90 },
  { type: "plant", x: 1750, y: 40 },
  { type: "plant", x: 1750, y: 660 },
];

const EAST_WING_ROOM_BOTTOM_Y = EAST_WING_ROOM_TOP_Y + EAST_WING_ROOM_HEIGHT;
const EAST_WING_ROOM_BOTTOM_WALL_Y = EAST_WING_ROOM_BOTTOM_Y - WALL_THICKNESS;
const EAST_WING_DOOR_BOTTOM_Y = EAST_WING_DOOR_Y + DOOR_LENGTH;
const EAST_WING_TOP_WALL_HEIGHT = EAST_WING_DOOR_Y - EAST_WING_ROOM_TOP_Y;
const EAST_WING_BOTTOM_WALL_HEIGHT =
  EAST_WING_ROOM_BOTTOM_Y - EAST_WING_DOOR_BOTTOM_Y;

const PREVIOUS_GYM_ROOM_ITEMS: FurnitureSeed[] = [
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_ROOM_HEIGHT,
  },
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: GYM_ROOM_END_X - GYM_ROOM_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_BOTTOM_WALL_Y,
    w: GYM_ROOM_END_X - GYM_ROOM_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: GYM_ROOM_END_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_TOP_WALL_HEIGHT,
  },
  {
    type: "door",
    x: GYM_ROOM_END_X,
    y: EAST_WING_DOOR_Y,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  {
    type: "wall",
    x: GYM_ROOM_END_X,
    y: EAST_WING_DOOR_BOTTOM_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_BOTTOM_WALL_HEIGHT,
  },
  { type: "treadmill", x: 1188, y: 88, facing: 90 },
  { type: "weight_bench", x: 1250, y: 92, facing: 90 },
  { type: "dumbbell_rack", x: 1272, y: 160, facing: 180 },
  { type: "rowing_machine", x: 1186, y: 248, facing: 90 },
  { type: "kettlebell_rack", x: 1278, y: 268, facing: 180 },
  { type: "exercise_bike", x: 1192, y: 370, facing: 90 },
  { type: "punching_bag", x: 1310, y: 394, facing: 0 },
  { type: "yoga_mat", x: 1218, y: 544, facing: 0, color: "#0f766e" },
  { type: "plant", x: 1312, y: 82 },
  { type: "plant", x: 1312, y: 622 },
];

const PREVIOUS_QA_LAB_ITEMS: FurnitureSeed[] = [
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_TOP_WALL_HEIGHT,
  },
  {
    type: "door",
    x: QA_LAB_X,
    y: EAST_WING_DOOR_Y,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_DOOR_BOTTOM_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_BOTTOM_WALL_HEIGHT,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: QA_LAB_END_X - QA_LAB_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_BOTTOM_WALL_Y,
    w: QA_LAB_END_X - QA_LAB_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: QA_LAB_END_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_ROOM_HEIGHT,
  },
  { type: "qa_terminal", x: 1496, y: 92, facing: 90 },
  { type: "device_rack", x: 1568, y: 88, facing: 180 },
  { type: "device_rack", x: 1568, y: 194, facing: 180 },
  { type: "test_bench", x: 1492, y: 300, facing: 90 },
  { type: "test_bench", x: 1492, y: 434, facing: 90 },
  { type: "plant", x: 1604, y: 82 },
  { type: "plant", x: 1604, y: 622 },
];

const DEFAULT_GYM_ITEMS: FurnitureSeed[] = [
  { type: "treadmill", x: 1230, y: 290, facing: 90 },
  { type: "weight_bench", x: 1310, y: 290, facing: 90 },
  { type: "dumbbell_rack", x: 1400, y: 300, facing: 180 },
  { type: "rowing_machine", x: 1230, y: 365, facing: 90 },
  { type: "kettlebell_rack", x: 1310, y: 365, facing: 180 },
  { type: "exercise_bike", x: 1400, y: 370, facing: 90 },
  { type: "punching_bag", x: 1270, y: 410, facing: 0 },
  { type: "yoga_mat", x: 1360, y: 410, facing: 0, color: "#0f766e" },
];

const DEFAULT_QA_LAB_ITEMS: FurnitureSeed[] = [
  { type: "qa_terminal", x: 1230, y: 710, facing: 90 },
  { type: "device_rack", x: 1360, y: 710, facing: 180 },
  { type: "device_rack", x: 1360, y: 790, facing: 180 },
  { type: "test_bench", x: 1230, y: 810, facing: 90 },
  { type: "test_bench", x: 1360, y: 810, facing: 90 },
];

const DEFAULT_ART_ROOM_ITEMS: FurnitureSeed[] = [
  { type: "easel", x: 1530, y: 710, facing: 90 },
  { type: "easel", x: 1650, y: 710, facing: 90 },
  { type: "whiteboard", x: 1530, y: 810, w: 10, h: 60 },
];

const DEFAULT_LOBBY_FURNITURE: FurnitureSeed[] = [
  { type: "round_table", x: 120, y: 110, r: 72 },
  { type: "chair", x: 182, y: 110, facing: 0 },
  { type: "chair", x: 160, y: 168, facing: 220 },
  { type: "chair", x: 92, y: 170, facing: 140 },
  { type: "chair", x: 58, y: 112, facing: 90 },
  { type: "chair", x: 92, y: 52, facing: 40 },
  { type: "bookshelf", x: 248, y: 32, w: 78, h: 118 },
  { type: "couch", x: 332, y: 92, w: 44, h: 112, vertical: true, facing: 180 },
  { type: "couch", x: 430, y: 92, w: 44, h: 112, vertical: true, facing: 180 },
  { type: "table_rect", x: 382, y: 138, w: 72, h: 34 },
  { type: "beanbag", x: 332, y: 210, color: "#1565c0", facing: 135 },
  { type: "beanbag", x: 436, y: 216, color: "#7c3aed", facing: 225 },
  { type: "whiteboard", x: 36, y: 214, w: 10, h: 64 },
  { type: "clock", x: 566, y: 6 },
  { type: "table_rect", x: 874, y: 102, w: 124, h: 34, facing: 0 },
  { type: "chair", x: 934, y: 176, facing: 180 },
  { type: "vending", x: 788, y: 10 },
  { type: "trash", x: 826, y: 20 },
  { type: "couch", x: 982, y: 382, w: 112, h: 42, facing: 90 },
  { type: "couch", x: 392, y: 634, w: 112, h: 42 },
  { type: "table_rect", x: 980, y: 380, w: 60, h: 30, facing: 270 },
  { type: "plant", x: 40, y: 40 },
  { type: "plant", x: 662, y: 32 },
  { type: "plant", x: 340, y: 700 },
  { type: "plant", x: 1088, y: 312 },
  { type: "plant", x: 530, y: 700 },
  ...DEFAULT_SERVER_ROOM_ITEMS,
  ...DEFAULT_GYM_ITEMS,
  ...DEFAULT_QA_LAB_ITEMS,
  ...DEFAULT_ART_ROOM_ITEMS,
];

const createWorkstation = (
  id: string,
  x: number,
  y: number,
): FurnitureSeed[] => [
  { type: "desk_cubicle", x, y, id },
  { type: "chair", x: x + 22, y: y - 10, facing: 180 },
  { type: "computer", x: x + 22, y: y - 13 },
  { type: "keyboard", x: x + 32, y: y - 5 },
  { type: "mouse", x: x + 54, y: y - 5 },
  { type: "trash", x: x + 78, y: y - 10 },
];

const createWorkstationGrid = (
  prefix: string,
  startX: number,
  startY: number,
  columns: number,
  rows: number,
  gapX = 130,
  gapY = 118,
): FurnitureSeed[] =>
  Array.from({ length: rows }).flatMap((_, row) =>
    Array.from({ length: columns }).flatMap((_, column) =>
      createWorkstation(
        `${prefix}_${row}_${column}`,
        startX + column * gapX,
        startY + row * gapY,
      ),
    ),
  );

const createRoomZone = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): FurnitureSeed[] => [
  { type: "room_zone", id, x, y, w, h, color },
  {
    type: "room_label",
    id,
    x: x + w / 2 - Math.min(210, Math.max(128, w * 0.54)) / 2,
    y: y + 18,
    w: Math.min(210, Math.max(128, w * 0.54)),
    h: 36,
    color,
  },
];

type OfficeRoomSpec = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};

const createRoomShell = ({ x, y, w, h }: OfficeRoomSpec): FurnitureSeed[] => {
  const doorWidth = DOOR_LENGTH + 12;
  const doorLeftWidth = Math.max(0, w / 2 - doorWidth / 2);
  const doorRightX = x + w / 2 + doorWidth / 2;
  const doorRightWidth = Math.max(0, x + w - doorRightX);
  return [
    { type: "wall", x, y, w, h: WALL_THICKNESS },
    { type: "wall", x, y: y + h - WALL_THICKNESS, w: doorLeftWidth, h: WALL_THICKNESS },
    {
      type: "wall",
      x: doorRightX,
      y: y + h - WALL_THICKNESS,
      w: doorRightWidth,
      h: WALL_THICKNESS,
    },
    {
      type: "door",
      x: x + w / 2 - DOOR_LENGTH / 2,
      y: y + h - DOOR_THICKNESS,
      w: DOOR_LENGTH,
      h: DOOR_THICKNESS,
      facing: 0,
    },
    { type: "wall", x, y, w: WALL_THICKNESS, h },
    { type: "wall", x: x + w - WALL_THICKNESS, y, w: WALL_THICKNESS, h },
  ];
};

const DEFAULT_OFFICE_ROOMS: OfficeRoomSpec[] = [
  // Management wing: one private office per management function.
  { id: "CEO SUITE|AI owner and strategy", x: 30, y: 240, w: 175, h: 170, color: "#2563eb" },
  { id: "COO OFFICE|Operating cadence", x: 225, y: 240, w: 175, h: 170, color: "#0f766e" },
  { id: "CFO OFFICE|Finance and capital", x: 420, y: 240, w: 175, h: 170, color: "#ca8a04" },
  { id: "LEGAL OFFICE|Contracts and compliance", x: 30, y: 450, w: 175, h: 170, color: "#7c3aed" },
  { id: "RISK OFFICE|Audit and evidence", x: 225, y: 450, w: 175, h: 170, color: "#dc2626" },
  { id: "SECURITY OFFICE|Access and guardrails", x: 420, y: 450, w: 175, h: 170, color: "#0891b2" },
  // Division wing: each team has a proper enclosed workroom.
  { id: "ENGINEERING DIVISION|ERP builders", x: 650, y: 240, w: 230, h: 170, color: "#15803d" },
  { id: "DATA + RND DIVISION|Research and analytics", x: 900, y: 240, w: 230, h: 170, color: "#9333ea" },
  { id: "MARKETING DIVISION|Brand and growth", x: 650, y: 450, w: 230, h: 170, color: "#ea580c" },
  { id: "PEOPLE DIVISION|HR and recruitment", x: 900, y: 450, w: 230, h: 170, color: "#0d9488" },
  { id: "FINANCE OPS DIVISION|Budget and billing", x: 650, y: 660, w: 230, h: 170, color: "#a16207" },
  { id: "AGENT OPS DIVISION|Recruit train retire", x: 900, y: 660, w: 230, h: 170, color: "#4f46e5" },
  // Work-life balance and shared support rooms.
  { id: "WELLBEING GYM|Fitness and recovery", x: 1190, y: 240, w: 280, h: 170, color: "#059669" },
  { id: "CAFE LOUNGE|Food and social", x: 1500, y: 240, w: 270, h: 170, color: "#d97706" },
  { id: "QUIET ROOM|Focus and reset", x: 1190, y: 450, w: 280, h: 170, color: "#6366f1" },
  { id: "MEETING HUB|Collaboration and standup", x: 1500, y: 450, w: 270, h: 170, color: "#0284c7" },
  { id: "IT + QA LAB|Infrastructure and testing", x: 1190, y: 660, w: 280, h: 170, color: "#334155" },
  { id: "CREATIVE STUDIO|Content and personal brand", x: 1500, y: 660, w: 270, h: 170, color: "#db2777" },
  // Only active projects are rendered as project rooms.
  { id: "GOORU PROJECT|Digital marketing only", x: 30, y: 930, w: 340, h: 300, color: "#6d28d9" },
  { id: "PABK PROJECT|ERP plus digital marketing", x: 390, y: 930, w: 340, h: 300, color: "#d97706" },
  { id: "FCP PROJECT|ERP plus digital marketing", x: 750, y: 930, w: 340, h: 300, color: "#0284c7" },
  { id: "SHARED SERVICES|Admin and personal ops", x: 1120, y: 930, w: 320, h: 300, color: "#0f766e" },
  { id: "PERSONAL OPS|Assistant and household", x: 1480, y: 930, w: 290, h: 300, color: "#475569" },
];

const DEFAULT_ROOM_ZONES: FurnitureSeed[] = DEFAULT_OFFICE_ROOMS.flatMap(
  ({ id, x, y, w, h, color }) => createRoomZone(id, x, y, w, h, color),
);

const DEFAULT_WORKROOM_PARTITIONS: FurnitureSeed[] =
  DEFAULT_OFFICE_ROOMS.flatMap(createRoomShell);

const DEFAULT_AGENT_WORKSTATIONS: FurnitureSeed[] = [
  ...createWorkstationGrid("mgmt_ceo", 66, 302, 1, 2, 0, 64),
  ...createWorkstationGrid("mgmt_ops", 261, 302, 1, 2, 0, 64),
  ...createWorkstationGrid("mgmt_finance", 456, 302, 1, 2, 0, 64),
  ...createWorkstationGrid("mgmt_legal", 66, 512, 1, 2, 0, 64),
  ...createWorkstationGrid("mgmt_risk", 261, 512, 1, 2, 0, 64),
  ...createWorkstationGrid("mgmt_security", 456, 512, 1, 2, 0, 64),
  ...createWorkstationGrid("division_engineering", 680, 302, 2, 1, 115, 0),
  ...createWorkstationGrid("division_data", 930, 302, 2, 1, 115, 0),
  ...createWorkstationGrid("division_marketing", 680, 512, 2, 1, 115, 0),
  ...createWorkstationGrid("division_people", 930, 512, 2, 1, 115, 0),
  ...createWorkstationGrid("division_finance", 680, 722, 2, 1, 115, 0),
  ...createWorkstationGrid("division_agent_ops", 930, 722, 2, 1, 115, 0),
  ...createWorkstationGrid("project_gooru", 64, 990, 3, 2, 104, 104),
  ...createWorkstationGrid("project_pabk", 424, 990, 3, 2, 104, 104),
  ...createWorkstationGrid("project_fcp", 784, 990, 3, 2, 104, 104),
  ...createWorkstationGrid("division_admin", 1150, 990, 2, 2, 120, 104),
  ...createWorkstationGrid("division_personal_ops", 1510, 990, 2, 2, 110, 104),
];

const DEFAULT_FURNITURE: FurnitureSeed[] = [
  // Reception and common support are kept in open areas, outside workrooms.
  { type: "round_table", x: 95, y: 92, r: 62 },
  { type: "chair", x: 150, y: 92, facing: 0 },
  { type: "chair", x: 118, y: 145, facing: 225 },
  { type: "chair", x: 55, y: 145, facing: 135 },
  { type: "bookshelf", x: 220, y: 42, w: 76, h: 108 },
  { type: "whiteboard", x: 620, y: 75, w: 10, h: 70 },
  { type: "clock", x: 540, y: 28 },
  { type: "trash", x: 610, y: 110 },
  { type: "lamp", x: 520, y: 160 },
  // Cafe lounge: food, hydration, informal conversation, and idle seating.
  { type: "fridge", x: 1530, y: 275, w: 40, h: 80 },
  { type: "coffee_machine", x: 1600, y: 275, elevation: 0.56 },
  { type: "vending", x: 1680, y: 275 },
  { type: "round_table", x: 1625, y: 350, r: 42 },
  { type: "chair", x: 1625, y: 300, facing: 0 },
  { type: "chair", x: 1625, y: 400, facing: 180 },
  { type: "chair", x: 1575, y: 350, facing: 90 },
  { type: "chair", x: 1675, y: 350, facing: 270 },
  { type: "plant", x: 1730, y: 380 },
  // Quiet and meeting rooms provide intentional breaks and collaboration.
  { type: "couch", x: 1225, y: 500, w: 100, h: 40, facing: 90 },
  { type: "beanbag", x: 1360, y: 520, color: "#1565c0", facing: 90 },
  { type: "beanbag", x: 1360, y: 575, color: "#7c3aed", facing: 90 },
  { type: "table_rect", x: 1580, y: 500, w: 120, h: 42, facing: 0 },
  { type: "chair", x: 1600, y: 575, facing: 180 },
  { type: "chair", x: 1690, y: 575, facing: 180 },
  { type: "plant", x: 1450, y: 560 },
  // Personal ops is the recreation and assistant support area.
  { type: "couch", x: 1515, y: 1040, w: 100, h: 40, facing: 90 },
  { type: "couch", x: 1650, y: 1140, w: 40, h: 80, vertical: true, facing: 180 },
  { type: "table_rect", x: 1600, y: 1080, w: 70, h: 36, facing: 270 },
  { type: "beanbag", x: 1520, y: 1140, color: "#e65100", facing: 90 },
  { type: "beanbag", x: 1600, y: 1170, color: "#1565c0", facing: 90 },
  { type: "plant", x: 1730, y: 1160 },
  ...DEFAULT_ROOM_ZONES,
  ...DEFAULT_WORKROOM_PARTITIONS,
  ...DEFAULT_AGENT_WORKSTATIONS,
  DEFAULT_ATM_MACHINE,
  DEFAULT_PHONE_BOOTH,
  DEFAULT_KANBAN_BOARD,
  DEFAULT_SMS_BOOTH,
  ...DEFAULT_SERVER_ROOM_ITEMS,
  ...DEFAULT_GYM_ITEMS,
  ...DEFAULT_QA_LAB_ITEMS,
  ...DEFAULT_ART_ROOM_ITEMS,
];

export const materializeDefaults = (
  preset: OfficeLayoutPreset = "office",
): FurnitureItem[] =>
  (preset === "lobby" ? DEFAULT_LOBBY_FURNITURE : DEFAULT_FURNITURE).map(
    (item, index) => ({
      ...item,
      _uid:
        item.type === "desk_cubicle" && item.id
          ? `${preset}_desk_${item.id}`
          : `${preset}_${index}`,
    }),
  );

export const getZoneDeskUids = (
  preset: OfficeLayoutPreset = "office",
): Map<string, string[]> => {
  const items = materializeDefaults(preset);
  const result = new Map<string, string[]>();
  for (const item of items) {
    if (item.type !== "desk_cubicle" || !item.id) continue;
    const parts = item.id.split("_");
    if (parts.length < 3) continue;
    const zone = parts.slice(0, parts.length - 2).join("_");
    if (!result.has(zone)) result.set(zone, []);
    result.get(zone)!.push(item._uid);
  }
  return result;
};

export const isRetiredPingPongLamp = (item: FurnitureItem) =>
  item.type === "lamp" &&
  ((item.x === 870 && item.y === 470) || (item.x === 900 && item.y === 580));

const createFurnitureSignature = (item: FurnitureSeed | FurnitureItem) =>
  [
    item.type,
    item.x,
    item.y,
    item.w ?? "",
    item.h ?? "",
    item.r ?? "",
    item.facing ?? "",
    item.vertical ? 1 : 0,
    item.elevation ?? "",
  ].join(":");

const PREVIOUS_SERVER_ROOM_SIGNATURES = new Set(
  [
    ...PREVIOUS_SERVER_ROOM_ITEMS_BOTTOM_RIGHT,
    ...PREVIOUS_SERVER_ROOM_ITEMS_TOP_RIGHT,
  ].map(createFurnitureSignature),
);

const SERVER_ROOM_SIGNATURES = new Set(
  DEFAULT_SERVER_ROOM_ITEMS.map(createFurnitureSignature),
);

const LEGACY_GYM_ROOM_SIGNATURES = new Set(
  LEGACY_GYM_ROOM_ITEMS.map(createFurnitureSignature),
);
const PREVIOUS_GYM_ROOM_SIGNATURES = new Set(
  PREVIOUS_GYM_ROOM_ITEMS.map(createFurnitureSignature),
);
const GYM_ROOM_SIGNATURES = new Set(
  DEFAULT_GYM_ITEMS.map(createFurnitureSignature),
);
const LEGACY_QA_LAB_SIGNATURES = new Set(
  LEGACY_QA_LAB_ITEMS.map(createFurnitureSignature),
);
const PREVIOUS_QA_LAB_SIGNATURES = new Set(
  PREVIOUS_QA_LAB_ITEMS.map(createFurnitureSignature),
);
const QA_LAB_SIGNATURES = new Set(
  DEFAULT_QA_LAB_ITEMS.map(createFurnitureSignature),
);

const hasSignature = (items: FurnitureItem[], signatures: Set<string>) =>
  items.some((item) => signatures.has(createFurnitureSignature(item)));

const hasAllSignatures = (items: FurnitureItem[], signatures: Set<string>) => {
  const itemSignatures = new Set(items.map(createFurnitureSignature));
  return [...signatures].every((signature) => itemSignatures.has(signature));
};

const replaceBySignatureSet = (
  items: FurnitureItem[],
  signatures: Set<string>,
) => items.filter((item) => !signatures.has(createFurnitureSignature(item)));

export const ensureOfficePingPongTable = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  if (items.some((item) => item.type === "pingpong")) return items;
  return [...items, { ...DEFAULT_PINGPONG_TABLE, _uid: nextUid() }];
};

export const ensureOfficeAtm = (items: FurnitureItem[]): FurnitureItem[] => {
  if (items.some((item) => item.type === "atm")) return items;
  if (hasAtmMigrationApplied()) return items;
  return [...items, { ...DEFAULT_ATM_MACHINE, _uid: nextUid() }];
};

export const ensureOfficeJukebox = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  if (items.some((item) => item.type === "jukebox")) return items;
  return [...items, { ...DEFAULT_JUKEBOX, _uid: nextUid() }];
};

export const ensureOfficeKanbanBoard = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  if (items.some((item) => item.type === "kanban_board")) return items;
  return [...items, { ...DEFAULT_KANBAN_BOARD, _uid: nextUid() }];
};

export const ensureOfficePhoneBooth = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  let found = false;
  const nextItems = items.map((item) => {
    if (item.type === "phone_booth") {
      found = true;
      if (item.x === 980 && item.y === 560) {
        return { ...item, x: 1050, y: 190 };
      }
    }
    return item;
  });

  if (found) return nextItems;
  if (hasPhoneBoothMigrationApplied()) return nextItems;
  return [...nextItems, { ...DEFAULT_PHONE_BOOTH, _uid: nextUid() }];
};

export const ensureOfficeSmsBooth = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  if (items.some((item) => item.type === "sms_booth")) return items;
  if (hasSmsBoothMigrationApplied()) return items;
  return [...items, { ...DEFAULT_SMS_BOOTH, _uid: nextUid() }];
};

export const ensureOfficeServerRoom = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  const hasCurrentServerRoom = items.some((item) =>
    SERVER_ROOM_SIGNATURES.has(createFurnitureSignature(item)),
  );
  if (hasCurrentServerRoom) return items;

  const hasPreviousServerRoom = items.some((item) =>
    PREVIOUS_SERVER_ROOM_SIGNATURES.has(createFurnitureSignature(item)),
  );

  if (hasPreviousServerRoom) {
    const withoutPreviousServerRoom = items.filter(
      (item) =>
        !PREVIOUS_SERVER_ROOM_SIGNATURES.has(createFurnitureSignature(item)) &&
        item.type !== "server_rack" &&
        item.type !== "server_terminal",
    );
    const nextItems = [...withoutPreviousServerRoom];
    for (const diningItem of DEFAULT_DINING_ITEMS) {
      const hasDiningItem = nextItems.some(
        (item) =>
          createFurnitureSignature(item) ===
          createFurnitureSignature(diningItem),
      );
      if (!hasDiningItem) {
        nextItems.push({ ...diningItem, _uid: nextUid() });
      }
    }
    return [
      ...nextItems,
      ...DEFAULT_SERVER_ROOM_ITEMS.map((item) => ({
        ...item,
        _uid: nextUid(),
      })),
    ];
  }

  if (items.some((item) => item.type === "server_terminal")) return items;
  if (hasServerRoomMigrationApplied()) return items;
  return [
    ...items,
    ...DEFAULT_SERVER_ROOM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
  ];
};

export const ensureOfficeGymRoom = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  const hasCurrentGymRoom = hasSignature(items, GYM_ROOM_SIGNATURES);
  if (hasCurrentGymRoom) return items;

  const hasPreviousGymRoom = hasAllSignatures(
    items,
    PREVIOUS_GYM_ROOM_SIGNATURES,
  );
  if (hasPreviousGymRoom) {
    return [
      ...replaceBySignatureSet(items, PREVIOUS_GYM_ROOM_SIGNATURES),
      ...DEFAULT_GYM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasLegacyGymRoom = hasAllSignatures(items, LEGACY_GYM_ROOM_SIGNATURES);
  if (hasLegacyGymRoom) {
    return [
      ...replaceBySignatureSet(items, LEGACY_GYM_ROOM_SIGNATURES),
      ...DEFAULT_GYM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasGymEquipment = items.some((item) =>
    [
      "treadmill",
      "weight_bench",
      "dumbbell_rack",
      "exercise_bike",
      "punching_bag",
      "rowing_machine",
      "kettlebell_rack",
      "yoga_mat",
    ].includes(item.type),
  );
  if (hasGymEquipment) return items;
  if (hasGymRoomMigrationApplied()) return items;
  return [
    ...items,
    ...DEFAULT_GYM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
  ];
};

export const ensureOfficeQaLab = (items: FurnitureItem[]): FurnitureItem[] => {
  const hasCurrentQaLab = hasSignature(items, QA_LAB_SIGNATURES);
  if (hasCurrentQaLab) return items;

  const hasPreviousQaLab = hasAllSignatures(items, PREVIOUS_QA_LAB_SIGNATURES);
  if (hasPreviousQaLab) {
    return [
      ...replaceBySignatureSet(items, PREVIOUS_QA_LAB_SIGNATURES),
      ...DEFAULT_QA_LAB_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasLegacyQaLab = hasAllSignatures(items, LEGACY_QA_LAB_SIGNATURES);
  if (hasLegacyQaLab) {
    return [
      ...replaceBySignatureSet(items, LEGACY_QA_LAB_SIGNATURES),
      ...DEFAULT_QA_LAB_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasQaFurniture = items.some((item) =>
    ["qa_terminal", "device_rack", "test_bench"].includes(item.type),
  );
  if (hasQaFurniture) return items;
  if (hasQaLabMigrationApplied()) return items;

  return [
    ...items,
    ...DEFAULT_QA_LAB_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
  ];
};
