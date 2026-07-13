export type TrafficDirection = 'downhill' | 'uphill';

export type TrafficStopArrivalDraft = {
  stopName: string;
  direction: TrafficDirection;
  directionLabel: string;
  branchLabel: string;
  etaText?: string;
  stopId?: string;
  stopSequence?: number | null;
  routeId?: string;
  routeName?: string;
};

export type TrafficStopArrival = {
  stopName: string;
  direction: TrafficDirection;
  directionLabel: string;
  branchLabel: string;
  etaText: string;
  etaMinutes: number | null;
  isDue: boolean;
  stopId?: string;
  stopSequence?: number | null;
  routeId?: string;
  routeName?: string;
};

export type TrafficSnapshot = {
  downhill: TrafficStopArrival[];
  uphill: TrafficStopArrival[];
  updatedAt: number;
  sourceUrl: string;
};

export type TrafficSyncResult = {
  success: boolean;
  updatedAt: number | null;
  counts: {
    downhill: number;
    uphill: number;
  };
  message?: string;
};

export const TRAFFIC_SOURCE_URL = 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000500';

const DOWNHILL_STOP_ORDER = ['文化大學一', '文化大學'];
const UPHILL_STOP_ORDER = ['文化大學', '文化大學一'];

const normalizeText = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();

export function normalizeTrafficEta(
  value?: string | null,
): Pick<TrafficStopArrival, 'etaText' | 'etaMinutes' | 'isDue'> {
  const etaText = normalizeText(value);

  if (!etaText) {
    return { etaText: '暫無資料', etaMinutes: null, isDue: false };
  }

  if (/進站中|即將到站|將到站|將進站|即將進站/i.test(etaText)) {
    return { etaText: '將進站', etaMinutes: 0, isDue: true };
  }

  const minuteMatch = etaText.match(/(\d+)\s*(?:分|分鐘)/);
  if (minuteMatch) {
    return {
      etaText: `${parseInt(minuteMatch[1], 10)}分`,
      etaMinutes: parseInt(minuteMatch[1], 10),
      isDue: false,
    };
  }

  return { etaText, etaMinutes: null, isDue: false };
}

export function normalizeTrafficArrival(draft: TrafficStopArrivalDraft): TrafficStopArrival {
  const eta = normalizeTrafficEta(draft.etaText);

  return {
    stopName: normalizeText(draft.stopName),
    direction: draft.direction,
    directionLabel: normalizeText(draft.directionLabel),
    branchLabel: normalizeText(draft.branchLabel),
    etaText: eta.etaText,
    etaMinutes: eta.etaMinutes,
    isDue: eta.isDue,
    stopId: draft.stopId,
    stopSequence: typeof draft.stopSequence === 'number' ? draft.stopSequence : null,
    routeId: draft.routeId,
    routeName: draft.routeName,
  };
}

export function sortTrafficArrivals(
  direction: TrafficDirection,
  arrivals: TrafficStopArrival[],
): TrafficStopArrival[] {
  const stopOrder = direction === 'downhill' ? DOWNHILL_STOP_ORDER : UPHILL_STOP_ORDER;

  return [...arrivals].sort((left, right) => {
    const leftOrder = stopOrder.indexOf(left.stopName);
    const rightOrder = stopOrder.indexOf(right.stopName);

    if (leftOrder !== rightOrder) {
      return (leftOrder === -1 ? 999 : leftOrder) - (rightOrder === -1 ? 999 : rightOrder);
    }

    const leftSequence = typeof left.stopSequence === 'number' ? left.stopSequence : 999;
    const rightSequence = typeof right.stopSequence === 'number' ? right.stopSequence : 999;
    return leftSequence - rightSequence;
  });
}

function getEtaRank(arrival: TrafficStopArrival) {
  if (arrival.isDue) return 0;
  if (typeof arrival.etaMinutes === 'number') return arrival.etaMinutes + 1;
  if (/未營運|尚未發車|末班已過|交管不停靠/i.test(arrival.etaText)) return 1000;
  if (arrival.etaText === '暫無資料') return 2000;
  return 1500;
}

export function pickBestTrafficArrival(arrivals: TrafficStopArrival[]): TrafficStopArrival | null {
  if (!arrivals.length) return null;

  return (
    [...arrivals].sort((left, right) => {
      const etaDiff = getEtaRank(left) - getEtaRank(right);
      if (etaDiff !== 0) return etaDiff;

      const leftSequence = typeof left.stopSequence === 'number' ? left.stopSequence : 999;
      const rightSequence = typeof right.stopSequence === 'number' ? right.stopSequence : 999;
      return leftSequence - rightSequence;
    })[0] || null
  );
}

export function formatTrafficUpdatedAt(updatedAt?: number | null): string {
  if (!updatedAt) return '--:--';

  const date = new Date(updatedAt);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
