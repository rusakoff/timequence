import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  children: ReactNode;
  ariaLabel: string;
  anchorKey: string;
  getAnchor: () => HTMLElement | null;
  suspended: boolean;
  onDismiss: (restoreFocus: boolean) => void;
};

/** Non-modal editor anchored to a cue. Suspends behind the sound library. */
export function SettingsPopover({
  children,
  ariaLabel,
  anchorKey,
  getAnchor,
  suspended,
  onDismiss,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ getAnchor, onDismiss });
  latest.current = { getAnchor, onDismiss };

  useLayoutEffect(() => {
    if (suspended) return;
    const popup = ref.current!;
    const card = popup.firstElementChild as HTMLElement;
    let frame = 0;
    let needsFocus = true;
    const place = () => {
      const anchor = latest.current.getAnchor();
      if (!anchor) return latest.current.onDismiss(false);
      const rect = anchor.getBoundingClientRect();
      const stage = anchor.closest(".sequence-scroll");
      const stageRect = stage?.getBoundingClientRect();
      const cue = anchor.classList.contains("sound-event");
      const canvasLeft = stageRect
        ? stageRect.left +
          (cue
            ? (stage
                ?.querySelector(".track-column-caption")
                ?.getBoundingClientRect().width ?? 0)
            : 0)
        : 0;
      const canvasTop =
        stage?.querySelector(".ruler-row")?.getBoundingClientRect().bottom ?? 0;
      if (
        stageRect &&
        (rect.right <= canvasLeft ||
          rect.left >= stageRect.right ||
          rect.bottom <= canvasTop ||
          rect.top >= stageRect.bottom)
      ) {
        latest.current.onDismiss(false);
        return;
      }
      const visual = window.visualViewport;
      const leftBound = (visual?.offsetLeft ?? 0) + 8;
      const topBound = (visual?.offsetTop ?? 0) + 8;
      const rightBound = leftBound + (visual?.width ?? innerWidth) - 16;
      const viewportBottom = topBound + (visual?.height ?? innerHeight) - 16;
      const transportTop =
        document.querySelector(".transport")?.getBoundingClientRect().top ??
        viewportBottom;
      const bottomBound = Math.min(
        viewportBottom,
        Math.max(topBound + 100, transportTop - 8),
      );
      const mobile = window.matchMedia("(max-width: 700px)").matches;
      const width = Math.min(mobile ? 360 : 304, rightBound - leftBound);
      popup.style.width = `${width}px`;
      const naturalHeight = card.scrollHeight + 2;
      const height = Math.min(naturalHeight, bottomBound - topBound);
      if (mobile) {
        popup.style.left = `${leftBound + (rightBound - leftBound - width) / 2}px`;
        popup.style.top = `${bottomBound - height}px`;
        popup.style.setProperty("--popover-height", `${height}px`);
        popup.dataset.side = "sheet";
        popup.style.visibility = "visible";
        if (needsFocus) {
          needsFocus = false;
          popup.focus({ preventScroll: true });
        }
        return;
      }
      const x =
        Math.max(canvasLeft, rect.left) +
        (Math.min(rect.right, stageRect?.right ?? rect.right) -
          Math.max(canvasLeft, rect.left)) /
          2;
      const y = (rect.top + rect.bottom) / 2;
      const gap = 10;
      const below = bottomBound - rect.bottom - gap;
      const above = rect.top - gap - topBound;
      let side: "top" | "bottom" | "left" | "right" =
        below >= height || below >= above ? "bottom" : "top";
      if (below < height && above < height) {
        if (rightBound - rect.right >= width + gap) side = "right";
        else if (rect.left - leftBound >= width + gap) side = "left";
      }
      const horizontal = side === "left" || side === "right";
      const maxHeight = horizontal
        ? height
        : Math.min(height, Math.max(80, side === "bottom" ? below : above));
      const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value));
      const left = clamp(
        side === "right"
          ? rect.right + gap
          : side === "left"
            ? rect.left - width - gap
            : x - width / 2,
        leftBound,
        rightBound - width,
      );
      const top = clamp(
        side === "bottom"
          ? rect.bottom + gap
          : side === "top"
            ? rect.top - gap - maxHeight
            : y - maxHeight / 2,
        topBound,
        bottomBound - maxHeight,
      );
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.setProperty("--popover-height", `${maxHeight}px`);
      popup.style.setProperty(
        "--popover-arrow",
        `${horizontal ? clamp(y - top, 14, maxHeight - 14) : clamp(x - left, 14, width - 14)}px`,
      );
      popup.dataset.side = side;
      popup.style.visibility = "visible";
      if (needsFocus) {
        needsFocus = false;
        popup.focus({ preventScroll: true });
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const outside = (event: Event) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.isConnected ||
        popup.contains(target)
      )
        return;
      // A different cue/grid cell opens its own editor in the same click.
      if (
        target.closest(
          ".sound-event,.grid-cell,.tick-ruler,.track-select,[aria-controls='sound-properties']",
        )
      )
        return;
      latest.current.onDismiss(false);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(card);
    const anchor = latest.current.getAnchor();
    if (anchor) observer.observe(anchor);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    // Click runs after blur so outside clicks still commit timing fields.
    document.addEventListener("click", outside);
    document.addEventListener("focusin", outside);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("click", outside);
      document.removeEventListener("focusin", outside);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [anchorKey, suspended]);

  return createPortal(
    <div
      ref={ref}
      id="sound-properties"
      className="settings-popover"
      role="dialog"
      aria-label={ariaLabel}
      tabIndex={-1}
      hidden={suspended}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDismiss(true);
        }
      }}
    >
      <div className="properties">{children}</div>
    </div>,
    document.body,
  );
}
