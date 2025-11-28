"use client";
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useId
} from "react";
import { createPortal } from "react-dom";
import "./tooltip.css";

// Simple utility to join class names
const cn = (...classes) => classes.filter(Boolean).join(" ");

const placementPositions = (triggerRect, tooltipRect, placement, offset) => {
  const { top, left, width, height } = triggerRect;
  const tW = tooltipRect.width;
  const tH = tooltipRect.height;

  const centerX = left + width / 2 - tW / 2;
  const centerY = top + height / 2 - tH / 2;

  switch (placement) {
    case "top":
      return { top: top - tH - offset, left: centerX };
    case "bottom":
      return { top: top + height + offset, left: centerX };
    case "left":
      return { top: centerY, left: left - tW - offset };
    case "right":
      return { top: centerY, left: left + width + offset };
    case "top-start":
      return { top: top - tH - offset, left };
    case "top-end":
      return { top: top - tH - offset, left: left + width - tW };
    case "bottom-start":
      return { top: top + height + offset, left };
    case "bottom-end":
      return { top: top + height + offset, left: left + width - tW };
    default:
      return { top: top - tH - offset, left: centerX };
  }
};

const colorClasses = {
  default: "bg-neutral-800 text-white",
  primary: "bg-blue-600 text-white",
  success: "bg-green-600 text-white",
  danger: "bg-red-600 text-white",
  warning: "bg-amber-500 text-black"
};

export const Tooltip = ({
  content,
  children,
  placement = "top",
  offset = 8,
  delay = 150,
  disabled = false,
  trigger = "hover", // hover | focus | press | manual
  open: controlledOpen,
  onOpenChange,
  showArrow = true,
  color = "default",
  className = "",
  id
}) => {
  const internalId = useId();
  const tooltipId = id || `tooltip-${internalId}`;
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const [coords, setCoords] = useState({ top: -9999, left: -9999 });
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const delayTimer = useRef(null);

  const setOpen = useCallback(
    (next, sourceEvent) => {
      if (disabled) return;
      if (!isControlled) setUncontrolledOpen(next);
      if (onOpenChange) onOpenChange(next, sourceEvent);
    },
    [disabled, isControlled, onOpenChange]
  );

  // Position calculation
  const updatePosition = useCallback(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const { top, left } = placementPositions(
      triggerRect,
      tooltipRect,
      placement,
      offset
    );
    setCoords({
      top: Math.round(top + window.scrollY),
      left: Math.round(left + window.scrollX)
    });
    setReady(true);
  }, [open, placement, offset]);

  useLayoutEffect(() => {
    if (open) {
      setReady(false);
      requestAnimationFrame(updatePosition);
    }
  }, [open, content, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handle = () => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    setMounted(true);
    return () => {
      clearTimeout(delayTimer.current);
    };
  }, []);

  // Trigger event handlers
  const handleShow = (e) => {
    clearTimeout(delayTimer.current);
    delayTimer.current = setTimeout(() => setOpen(true, e), delay);
  };
  const handleHide = (e) => {
    clearTimeout(delayTimer.current);
    setOpen(false, e);
  };

  const child = React.Children.only(children);
  const childProps = {};

  if (!disabled) {
    if (trigger === "hover") {
      childProps.onMouseEnter = (e) => {
        child.props.onMouseEnter && child.props.onMouseEnter(e);
        handleShow(e);
      };
      childProps.onMouseLeave = (e) => {
        child.props.onMouseLeave && child.props.onMouseLeave(e);
        handleHide(e);
      };
      childProps.onFocus = (e) => {
        child.props.onFocus && child.props.onFocus(e);
        handleShow(e);
      };
      childProps.onBlur = (e) => {
        child.props.onBlur && child.props.onBlur(e);
        handleHide(e);
      };
    } else if (trigger === "focus") {
      childProps.onFocus = (e) => {
        child.props.onFocus && child.props.onFocus(e);
        handleShow(e);
      };
      childProps.onBlur = (e) => {
        child.props.onBlur && child.props.onBlur(e);
        handleHide(e);
      };
    } else if (trigger === "press") {
      childProps.onClick = (e) => {
        child.props.onClick && child.props.onClick(e);
        setOpen(!open, e);
      };
    }
  }

  if (open) {
    childProps["aria-describedby"] = tooltipId;
  }

  const arrowSize = 7;
  const arrowPosition = () => {
    if (!tooltipRef.current) return {};
    const side = placement.split("-")[0];
    switch (side) {
      case "top":
        return {
          bottom: -arrowSize + 2,
          left: "50%",
          transform: "translateX(-50%) rotate(180deg)"
        };
      case "bottom":
        return {
          top: -arrowSize + 2,
          left: "50%",
          transform: "translateX(-50%)"
        };
      case "left":
        return {
          right: -arrowSize + 2,
          top: "50%",
          transform: "translateY(-50%) rotate(90deg)"
        };
      case "right":
        return {
          left: -arrowSize + 2,
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)"
        };
      default:
        return {};
    }
  };

  const tooltipNode = open && mounted
    ? createPortal(
        <div
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "absolute",
            top: coords.top,
            left: coords.left,
            zIndex: 1000,
            pointerEvents: "none",
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(2px)",
            transition: "opacity 120ms ease, transform 120ms ease",
            visibility: ready ? "visible" : "hidden"
          }}
          className={cn(
            "mp-tooltip",
            "px-2 py-1 text-xs rounded-md shadow-lg select-none",
            colorClasses[color] || colorClasses.default,
            className
          )}
          data-placement={placement}
        >
          {content}
          {showArrow && (
            <span
              aria-hidden="true"
              style={arrowPosition()}
              className={cn(
                "mp-tooltip-arrow",
                "absolute w-3 h-3",
                "before:content-[''] before:absolute before:inset-0 before:rotate-45 before:bg-inherit before:rounded-[2px]"
              )}
              data-placement={placement}
            />
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {React.cloneElement(child, {
        ref: (node) => {
          triggerRef.current = node || triggerRef.current;
          // preserve existing ref
          if (child.ref) {
            if (typeof child.ref === "function") child.ref(node);
            else child.ref.current = node;
          }
        },
        ...childProps
      })}
      {tooltipNode}
    </>
  );
};

// Optional: small helper hook for manual control
export const useTooltip = () => {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, show, hide, toggle };
};
