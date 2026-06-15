export type ScheduleLockNode = {
  scheduleid: number;
  status?: string | null;
  depends_on_scheduleid?: number[] | null;
  phasename?: string | null;
};

const normalizeStatus = (status?: string | null) =>
  String(status || "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();

export const isOnHoldStatus = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  return normalized === "on hold" || normalized === "hold";
};

export const buildScheduleLockState = (schedule: ScheduleLockNode[]) => {
  const childMap = new Map<number, number[]>();

  schedule.forEach((item) => {
    (item.depends_on_scheduleid || []).forEach((parentId) => {
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId)!.push(item.scheduleid);
    });
  });

  const onHoldIds = new Set(
    schedule.filter((item) => isOnHoldStatus(item.status)).map((item) => item.scheduleid)
  );
  const downstreamIds = new Set<number>();

  onHoldIds.forEach((holdId) => {
    const stack = [...(childMap.get(holdId) || [])];
    while (stack.length) {
      const currentId = stack.pop()!;
      if (downstreamIds.has(currentId) || onHoldIds.has(currentId)) continue;
      downstreamIds.add(currentId);
      (childMap.get(currentId) || []).forEach((childId) => stack.push(childId));
    }
  });

  return {
    onHoldIds,
    downstreamIds,
    lockedIds: new Set<number>([...onHoldIds, ...downstreamIds]),
  };
};

export const findBlockingAncestor = (
  scheduleMap: Map<number, ScheduleLockNode>,
  onHoldIds: Set<number>,
  schedule: ScheduleLockNode,
  visited = new Set<number>()
): ScheduleLockNode | undefined => {
  const parentIds = schedule.depends_on_scheduleid || [];

  for (const parentId of parentIds) {
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const parent = scheduleMap.get(parentId);
    if (!parent) continue;

    if (onHoldIds.has(parent.scheduleid)) {
      return parent;
    }

    const ancestor = findBlockingAncestor(scheduleMap, onHoldIds, parent, visited);
    if (ancestor) return ancestor;
  }

  return undefined;
};
