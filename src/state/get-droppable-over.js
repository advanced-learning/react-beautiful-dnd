// @flow
import { type Position, type Rect } from 'css-box-model';
import type {
  DroppableDimension,
  DroppableDimensionMap,
  DroppableId,
  DraggableDimension,
  Axis,
} from '../types';
import { toDroppableList } from './dimension-structures';
import isPositionInFrame from './visibility/is-position-in-frame';
import { distance, patch } from './position';
import isWithin from './is-within';

// https://stackoverflow.com/questions/306316/determine-if-two-rectangles-overlap-each-other
// https://silentmatt.com/rectangle-intersection/
function getHasOverlap(first: Rect, second: Rect): boolean {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

type Args = {|
  pageBorderBox: Rect,
  draggable: DraggableDimension,
  droppables: DroppableDimensionMap,
|};

function getCandidateWithGreatestOverlap({ pageBorderBox, candidates }) {
  let maxOverlapArea = 0;
  let candidateWithMaxOverlap = null;

  candidates.forEach(candidate => {
    const active = candidate.subject.active;
    if (!active) {
      return;
    }

    // Calculate the overlap rectangle
    const overlapLeft = Math.max(pageBorderBox.left, active.left);
    const overlapRight = Math.min(pageBorderBox.right, active.right);
    const overlapTop = Math.max(pageBorderBox.top, active.top);
    const overlapBottom = Math.min(pageBorderBox.bottom, active.bottom);

    const overlapWidth = overlapRight - overlapLeft;
    const overlapHeight = overlapBottom - overlapTop;

    // Check if there is an actual overlap
    if (overlapWidth > 0 && overlapHeight > 0) {
      const overlapArea = overlapWidth * overlapHeight;
      if (overlapArea > maxOverlapArea) {
        maxOverlapArea = overlapArea;
        candidateWithMaxOverlap = candidate;
      }
    }
  });

  return candidateWithMaxOverlap ? candidateWithMaxOverlap.descriptor.id : null;
}

export default function getDroppableOver({
  pageBorderBox,
  draggable,
  droppables,
}: Args): ?DroppableId {
  // We know at this point that some overlap has to exist
  const candidates: DroppableDimension[] = toDroppableList(droppables).filter(
    (item: DroppableDimension): boolean => {
      // Cannot be a candidate when disabled
      if (!item.isEnabled) {
        return false;
      }

      // Cannot be a candidate when there is no visible area
      const active: ?Rect = item.subject.active;
      if (!active) {
        return false;
      }

      // Cannot be a candidate when dragging item is not over the droppable at all
      if (!getHasOverlap(pageBorderBox, active)) {
        return false;
      }

      // 1. Candidate if the center position is over a droppable
      if (isPositionInFrame(active)(pageBorderBox.center)) {
        return true;
      }

      // 2. Candidate if an edge is over the cross axis half way point
      // 3. Candidate if dragging item is totally over droppable on cross axis

      const axis: Axis = item.axis;
      const childCenter: number = active.center[axis.crossAxisLine];
      const crossAxisStart: number = pageBorderBox[axis.crossAxisStart];
      const crossAxisEnd: number = pageBorderBox[axis.crossAxisEnd];

      const isContained = isWithin(
        active[axis.crossAxisStart],
        active[axis.crossAxisEnd],
      );

      const isStartContained: boolean = isContained(crossAxisStart);
      const isEndContained: boolean = isContained(crossAxisEnd);

      // Dragging item is totally covering the active area
      if (!isStartContained && !isEndContained) {
        return true;
      }

      /**
       * edges must go beyond the center line in order to avoid
       * cases were both conditions are satisfied.
       */
      if (isStartContained) {
        return crossAxisStart < childCenter;
      }

      return crossAxisEnd > childCenter;
    },
  );

  if (!candidates.length) {
    return null;
  }

  // Only one candidate - use that!
  if (candidates.length === 1) {
    return candidates[0].descriptor.id;
  }

  // Multiple options returned
  // Should only occur with really large items
  // Going to use fallback: option with greatest overlap.
  return getCandidateWithGreatestOverlap({
    pageBorderBox,
    candidates,
  });
}
