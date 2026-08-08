import { getEmperorSeatMap as getBaseEmperorSeatMap } from "./emperor-seat.js";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundsFromNormalizedSeats(seats = []) {
  const points = seats
    .map(seat => ({
      left: finite(seat?.position?.left),
      top: finite(seat?.position?.top)
    }))
    .filter(point => point.left !== null && point.top !== null);

  if (!points.length) {
    return {
      minLeft: 0,
      maxLeft: 0,
      minTop: 0,
      maxTop: 0,
      width: 0,
      height: 0
    };
  }

  const lefts = points.map(point => point.left);
  const tops = points.map(point => point.top);
  const minLeft = Math.min(...lefts);
  const maxLeft = Math.max(...lefts);
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);

  return {
    minLeft,
    maxLeft,
    minTop,
    maxTop,
    width: Math.max(0, maxLeft - minLeft + 32),
    height: Math.max(0, maxTop - minTop + 32)
  };
}

export async function getEmperorSeatMap(params) {
  const result = await getBaseEmperorSeatMap(params);
  const sections = (Array.isArray(result?.sections) ? result.sections : []).map(section => ({
    ...section,
    bounds: boundsFromNormalizedSeats(section?.seats)
  }));

  return {
    ...result,
    sections,
    geometryVersion: "6e1-bounds-v2"
  };
}
