import { useEffect, useRef, useState } from "react";
import { fetchInfo } from "../services/api";
import { strings } from "../i18n/strings";
import type { InfoResponse } from "../types/api";

const i = strings.info;

// Small fixed info button in the bottom-right corner. Clicking it toggles a
// popover with project info (description, version, license) and a link to the
// repository, loaded from GET /api/v1/info on first open. Falls back to static
// strings if the request fails. Closes on Escape or a click outside.
export function InfoButton() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Lazy-load project info the first time the popover is opened.
  useEffect(() => {
    if (!open || info) return;
    let active = true;
    void fetchInfo()
      .then((d) => {
        if (active) setInfo(d);
      })
      .catch(() => {
        /* keep static fallbacks */
      });
    return () => {
      active = false;
    };
  }, [open, info]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const title = info?.name ?? i.title;
  const description = info?.description ?? i.description;
  const repoUrl = info?.repository ?? i.repoUrl;

  return (
    <div className="info" ref={rootRef}>
      {open && (
        <div className="info-popover" role="dialog" aria-label={title}>
          <div className="info-title">{title}</div>
          <p className="info-desc">{description}</p>
          {info && (
            <div className="info-meta">
              <span>
                {i.versionLabel}: {info.version}
              </span>
              <span>
                {i.licenseLabel}: {info.license}
              </span>
            </div>
          )}
          <a
            className="info-link"
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {i.repoLinkText}
          </a>
        </div>
      )}
      <button
        type="button"
        className="btn btn-icon info-button"
        aria-label={i.openAria}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={i.openAria}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
    </div>
  );
}
