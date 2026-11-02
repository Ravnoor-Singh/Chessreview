// Hand-off between the input screen and the review screen.
export interface PendingReview {
  pgn?: string;
  fen?: string;
  reviewId?: string;
}

const KEY = 'chess-review:pending';

export function setPendingReview(p: PendingReview): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sessionStorage unavailable; the review page will ask for input again.
  }
}

export function takePendingReview(): PendingReview | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as PendingReview;
  } catch {
    return null;
  }
}
