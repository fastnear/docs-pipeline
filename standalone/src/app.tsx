import React from "react";
import { createRoot } from "react-dom/client";

import { FastnearOperationPage } from "../../shared/FastnearOperationPage";
import { getFastnearPageModel } from "../../shared/fastnearPageModel";

import "./standalonePage.css";

function StandaloneApp() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const pageModel = getFastnearPageModel({ pathname });
  const securityScheme = pageModel?.securitySchemes[0];

  if (!pageModel) {
    return (
      <div className="standalone-view-account">
        <div className="standalone-view-account__shell">
          <header className="standalone-view-account__hero">
            <div className="standalone-view-account__hero-copy">
              <span className="standalone-view-account__eyebrow">Local verification runtime</span>
              <h1>Route not found</h1>
              <p className="standalone-view-account__hero-summary">
                No bespoke page model is registered for <code>{pathname}</code>.
              </p>
            </div>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className="standalone-view-account">
      <div className="standalone-view-account__shell">
        <header className="standalone-view-account__hero">
          <div className="standalone-view-account__hero-copy">
            <div className="standalone-view-account__eyebrow-row">
              <span className="standalone-view-account__eyebrow">Local verification runtime</span>
              <span className="standalone-view-account__route-pill">
                {pageModel.route.method} {pageModel.route.path}
              </span>
            </div>
            <h1>{pageModel.info.title}</h1>
            <p className="standalone-view-account__hero-summary">{pageModel.info.description}</p>
            <div className="standalone-view-account__hero-note">
              This page is a local custom runtime built from the generated page model.
            </div>
          </div>

          <aside className="standalone-view-account__hero-side">
            <div className="standalone-panel standalone-panel--tight">
              <h2>Available networks</h2>
              <div className="standalone-server-list">
                {pageModel.interaction.networks.map((network) => (
                  <div key={network.label} className="standalone-server-list__item">
                    <span>{network.label}</span>
                    <code>{network.url}</code>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </header>

        {securityScheme ? (
          <section className="standalone-view-account__security">
            <div className="standalone-panel standalone-panel--security">
              <div className="standalone-panel__heading-row">
                <h2>Security</h2>
                <span className="standalone-panel__badge">Portal contract</span>
              </div>
              <div className="standalone-security-grid">
                <div>
                  <h3>{securityScheme.id}</h3>
                  <p>
                    {securityScheme.description ||
                      "This operation accepts an optional FastNEAR API key."}
                  </p>
                  <p>
                    Contract shape: <code>{securityScheme.in}</code>{" "}
                    <code>{securityScheme.name}</code>
                  </p>
                </div>
                {pageModel.interaction.authTransport === "bearer" ? (
                  <div>
                    <h3>Custom interaction transport</h3>
                    <p>
                      This bespoke page standardizes on <code>Authorization: Bearer</code> for the
                      live request and copied curl while preserving the public URL input contract.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <FastnearOperationPage pageModel={pageModel} surface="standalone" />
      </div>
    </div>
  );
}

const container = document.getElementById("app");

if (!container) {
  throw new Error("Standalone app root element is missing.");
}

createRoot(container).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>
);
