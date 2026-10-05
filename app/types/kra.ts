export type KRAConfig = {
  id: string;
  name: string;
  weight: number;
  description?: string;
  active: boolean;
  order: number;
  /** Marks the KRA that the quarterly Go Live carry-forward rule applies to. */
  isGoLive?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GoLiveCarryForwardConfig = {
  enabled: boolean;
  percentage: number;
};

export type GoLiveAchievement = {
  manual: number;
  carryForward: number;
  total: number;
  source: "manual" | "carry-forward" | "manual+carry-forward";
};
